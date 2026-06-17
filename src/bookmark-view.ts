import {
	debounce,
	ItemView,
	Menu,
	Notice,
	normalizePath,
	prepareFuzzySearch,
	setIcon,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import type BookmarkerPlugin from "./main";
import { CategoryStyleModal } from "./category-style-modal";
import { isSafeRemoteUrl } from "./url-safety";
import { fetchHtml, parseMetadata } from "./metadata";
import { readTaxonomy } from "./taxonomy";
import { classifyBookmark } from "./classifier";
import { FolderSuggestModal } from "./folder-suggest";
import { RegenerateTagsModal } from "./regenerate-tags-modal";
import { appendNote, ensureFolder, sanitizeFolderPath } from "./note-writer";
import { AnnotateModal } from "./annotate-modal";
import { normalizeTags } from "./tags";
import { ManageTagModal } from "./manage-tag-modal";
import { changeTagEverywhere, countTagUsage } from "./tag-ops";
import { refreshBookmarkCard } from "./refresh-card";
import { hashPassword, PasswordPromptModal } from "./password-modal";

export const BOOKMARK_VIEW_TYPE = "bookmarker-grid";
const MAX_CARD_TAGS = 4;
const MAX_RELATED = 50;

/** Render a category icon: a Lucide name produces an SVG, anything else (emoji) falls back to text. */
function renderCategoryIcon(el: HTMLElement, value: string): void {
	el.empty();
	setIcon(el, value);
	if (!el.querySelector("svg")) el.setText(value);
}

interface BookmarkItem {
	file: TFile;
	title: string;
	url: string;
	image: string;
	tags: string[];
	domain: string;
	folder: string;
	created: string;
	/** File modification time (ms epoch), for the "Modified" sort. */
	modified: number;
	type: string;
	favorite: boolean;
	broken: boolean;
	hidden: boolean;
	description: string;
}

/** Raindrop-like board: a grid of cover cards for the saved bookmarks (read-only). */
export class BookmarkView extends ItemView {
	private readonly plugin: BookmarkerPlugin;
	private items: BookmarkItem[] = [];
	private search = "";
	private relatedTo: BookmarkItem | null = null;
	private folderFilter = "";
	private tagFilter = "";
	private domainFilter = "";
	private typeFilter = "";
	private favoritesOnly = false;
	private brokenOnly = false;
	private showHidden = false;
	/** Per-session unlock for the password-gated Hidden toggle; resets on each new board. */
	private hiddenUnlocked = false;
	/** Landing shows category tiles; entering one switches to the card grid. */
	private viewMode: "categories" | "cards" = "categories";
	/** The category (folder, "" = Uncategorized) entered from a tile, else null. */
	private activeCategory: string | null = null;
	/** When inside a category, whether search/filters span all bookmarks or just that category. */
	private searchScope: "global" | "category" = "category";
	/** Whether the (potentially large) tag filter panel is expanded. */
	private tagsExpanded = false;
	/** Tag panel sort order: by assignment count (default) or alphabetical. */
	private tagSort: "count" | "alpha" = "count";
	/** Paths of cards the user has ticked for a bulk Organize command. */
	private readonly selected = new Set<string>();
	private gridEl!: HTMLElement;
	private tagSectionEl!: HTMLElement;
	private countEl!: HTMLElement;
	private deleteBrokenBtn!: HTMLButtonElement;
	private hideSelectedBtn!: HTMLButtonElement;

	constructor(leaf: WorkspaceLeaf, plugin: BookmarkerPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return BOOKMARK_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Bookmarks";
	}

	getIcon(): string {
		return "bookmark";
	}

	async onOpen(): Promise<void> {
		this.rebuild();

		// Keep the board live. metadataCache "changed" fires once a file's
		// frontmatter is parsed, so a freshly saved bookmark appears on its own,
		// no manual refresh or app reload. Create/delete/rename cover the rest.
		const refresh = debounce(() => this.refreshData(), 300);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (this.isUnderRoot(file.path)) refresh();
			}),
		);
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (this.isUnderRoot(file.path)) refresh();
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (this.isUnderRoot(file.path)) refresh();
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (this.isUnderRoot(file.path) || this.isUnderRoot(oldPath)) refresh();
			}),
		);
	}

	/** True when a path is the root folder or sits under it. */
	private isUnderRoot(path: string): boolean {
		const root = normalizePath(this.plugin.settings.rootFolder);
		return path === root || path.startsWith(`${root}/`);
	}

	/** Re-scan the vault and redraw the grid, keeping the toolbar, filters, and selection. */
	private refreshData(): void {
		// Selection persists across background vault events; it is cleared only on an
		// explicit rebuild (Refresh button, filter/domain/related change). Stale paths
		// are harmless: getSelectedFiles() resolves against the current item set.
		this.loadBookmarks();
		// The category landing has no grid/selection to preserve; redraw it in place.
		if (this.viewMode === "categories" && !this.domainFilter && !this.relatedTo) {
			this.contentEl.empty();
			this.contentEl.addClass("bookmarker-board");
			this.renderCategories();
			return;
		}
		// Leave related mode if its source bookmark was deleted.
		const related = this.relatedTo;
		if (related && !this.items.some((i) => i.file.path === related.file.path)) {
			this.relatedTo = null;
			this.rebuild();
			return;
		}
		this.renderGrid();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/** Filter the board to a single domain (www-insensitive) and redraw. */
	filterByDomain(domain: string): void {
		this.domainFilter = domain.toLowerCase().replace(/^www\./, "");
		this.viewMode = "cards";
		this.rebuild();
	}

	/** Files of the cards the user has selected (resolved against the current set). */
	getSelectedFiles(): TFile[] {
		return this.items.filter((i) => this.selected.has(i.file.path)).map((i) => i.file);
	}

	/** Files currently visible under the active filters/search. */
	getVisibleFiles(): TFile[] {
		return this.filtered().map((i) => i.file);
	}

	/** Full rebuild: re-scan the vault and redraw the active view (categories or cards). */
	private rebuild(): void {
		this.selected.clear();
		this.contentEl.empty();
		this.contentEl.addClass("bookmarker-board");
		this.loadBookmarks();
		// Domain/related drilldowns are inherently card views; force cards mode for them.
		if (this.viewMode === "categories" && !this.domainFilter && !this.relatedTo) {
			this.renderCategories();
			return;
		}
		this.renderToolbar();
		this.gridEl = this.contentEl.createDiv({ cls: "bookmarker-grid" });
		this.applyCardSize();
		this.renderGrid();
	}

	/** Minimum grid column width for the chosen card size. */
	private cardMin(): string {
		return this.sizeVars()["--bm-card-min"];
	}

	/** Grid CSS variables for the chosen card size: width, fixed height/cover, title/tag scale. */
	private sizeVars(): Record<string, string> {
		switch (this.plugin.settings.cardSize) {
			case "small":
				return {
					"--bm-card-min": "160px",
					"--bm-card-h": "250px",
					"--bm-card-cover-h": "96px",
					"--bm-card-title": "0.85em",
					"--bm-card-tag": "0.7em",
				};
			case "large":
				return {
					"--bm-card-min": "300px",
					"--bm-card-h": "380px",
					"--bm-card-cover-h": "176px",
					"--bm-card-title": "1.2em",
					"--bm-card-tag": "0.85em",
				};
			default:
				return {
					"--bm-card-min": "220px",
					"--bm-card-h": "320px",
					"--bm-card-cover-h": "132px",
					"--bm-card-title": "1em",
					"--bm-card-tag": "var(--font-ui-smaller)",
				};
		}
	}

	/** Drive the grid's column width and title/tag scale from the chosen card size. */
	private applyCardSize(): void {
		this.gridEl.setCssProps(this.sizeVars());
	}

	/**
	 * Category landing: a tile per subfolder of the root ("" = Uncategorized), so the board
	 * opens without loading every card. Each tile carries a customizable color and icon and
	 * drills into the cards view scoped to that category.
	 */
	private renderCategories(): void {
		const header = this.contentEl.createDiv({ cls: "bookmarker-toolbar" });
		header.createSpan({ cls: "bookmarker-board-title", text: "Categories" });

		// Switch straight to the full card grid (all bookmarks, no category scope).
		const allCards = header.createEl("button", {
			cls: "bookmarker-toolbar-btn",
			text: "▦ All cards",
		});
		allCards.addEventListener("click", () => {
			this.viewMode = "cards";
			this.activeCategory = null;
			this.searchScope = "global";
			this.search = "";
			this.rebuild();
		});

		const searchInput = header.createEl("input", {
			cls: "bookmarker-search",
			attr: { type: "search", placeholder: "Search all bookmarks…" },
		});
		// Searching from the landing drops straight into a global card view.
		searchInput.addEventListener("input", () => {
			const query = searchInput.value.toLowerCase().trim();
			if (!query) return;
			this.search = query;
			this.searchScope = "global";
			this.activeCategory = null;
			this.viewMode = "cards";
			this.rebuild();
		});

		const refresh = header.createEl("button", { cls: "bookmarker-toolbar-btn", text: "Refresh" });
		refresh.addEventListener("click", () => this.rebuild());

		const counts = new Map<string, number>();
		for (const item of this.items) {
			if (item.hidden && !this.showHidden) continue;
			counts.set(item.folder, (counts.get(item.folder) ?? 0) + 1);
		}

		const grid = this.contentEl.createDiv({ cls: "bookmarker-category-grid" });
		grid.setCssProps({ "--bm-card-min": this.cardMin() });
		if (counts.size === 0) {
			grid.createDiv({
				cls: "bookmarker-empty",
				text: this.items.length ? "No categories." : "No bookmarks yet.",
			});
			return;
		}

		// Named categories alphabetically; Uncategorized ("") always last.
		const categories = [...counts.keys()].sort(
			(a, b) => Number(a === "") - Number(b === "") || a.localeCompare(b),
		);
		for (const category of categories) {
			this.renderCategoryTile(grid, category, counts.get(category) ?? 0);
		}
	}

	private renderCategoryTile(grid: HTMLElement, category: string, count: number): void {
		const style = this.plugin.settings.categoryStyles[category] ?? { color: "", icon: "" };
		const tile = grid.createDiv({ cls: "bookmarker-category-tile" });
		if (style.color) tile.setCssProps({ "--bm-cat-color": style.color });

		const iconEl = tile.createSpan({ cls: "bookmarker-category-icon" });
		renderCategoryIcon(iconEl, style.icon || "folder");

		const body = tile.createDiv({ cls: "bookmarker-category-body" });
		body.createDiv({ cls: "bookmarker-category-name", text: category || "Uncategorized" });
		body.createDiv({
			cls: "bookmarker-category-count",
			text: `${count} bookmark${count === 1 ? "" : "s"}`,
		});

		const edit = tile.createSpan({
			cls: "bookmarker-category-edit",
			text: "✎",
			attr: { "aria-label": "Edit category color and icon", title: "Edit category color and icon" },
		});
		edit.addEventListener("click", (event) => {
			event.stopPropagation();
			this.editCategoryStyle(category);
		});

		tile.addEventListener("click", () => {
			this.activeCategory = category;
			this.searchScope = "category";
			this.viewMode = "cards";
			this.rebuild();
		});
	}

	private editCategoryStyle(category: string): void {
		const current = this.plugin.settings.categoryStyles[category] ?? { color: "", icon: "" };
		new CategoryStyleModal(this.app, {
			category: category || "Uncategorized",
			color: current.color,
			icon: current.icon,
			onSave: (color, icon) => {
				if (!color && !icon) delete this.plugin.settings.categoryStyles[category];
				else this.plugin.settings.categoryStyles[category] = { color, icon };
				void this.plugin.saveSettings();
				this.rebuild();
			},
		}).open();
	}

	private loadBookmarks(): void {
		const root = normalizePath(this.plugin.settings.rootFolder);
		const prefix = `${root}/`;
		const items: BookmarkItem[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (file.path !== root && !file.path.startsWith(prefix)) continue;
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!fm || fm.source !== "obsidian-bookmarker") continue;
			const parent = file.parent?.path ?? "";
			items.push({
				file,
				title: this.plugin.settings.useFileNameAsTitle
					? file.basename
					: asString(fm.title) || file.basename,
				url: asString(fm.url),
				image: asString(fm.image),
				tags: normalizeTags(fm.tags),
				domain: asString(fm.domain),
				folder: parent.startsWith(prefix) ? parent.slice(prefix.length) : "",
				created: asString(fm.created),
				modified: file.stat.mtime,
				type: asString(fm.type) || "link",
				favorite: fm.favorite === true,
				broken: fm.broken === true,
				hidden: fm.hidden === true,
				description: asString(fm.description),
			});
		}
		items.sort((a, b) => b.created.localeCompare(a.created));
		this.items = items;
	}

	private renderToolbar(): void {
		const toolbar = this.contentEl.createDiv({ cls: "bookmarker-toolbar" });

		const back = toolbar.createEl("button", {
			cls: "bookmarker-toolbar-btn",
			text: "← Categories",
		});
		back.addEventListener("click", () => {
			this.viewMode = "categories";
			this.activeCategory = null;
			this.domainFilter = "";
			this.relatedTo = null;
			this.search = "";
			this.rebuild();
		});

		// Scope toggle: search/filter within the entered category, or across all bookmarks.
		if (this.activeCategory !== null) {
			const label = this.activeCategory || "Uncategorized";
			const scopeSel = toolbar.createEl("select", { cls: "bookmarker-scope-select" });
			scopeSel.createEl("option", { value: "category", text: `In "${label}"` });
			scopeSel.createEl("option", { value: "global", text: "All bookmarks" });
			scopeSel.value = this.searchScope;
			scopeSel.addEventListener("change", () => {
				this.searchScope = scopeSel.value === "global" ? "global" : "category";
				this.renderGrid();
			});
		}

		if (this.domainFilter) {
			const chip = toolbar.createSpan({
				cls: "bookmarker-tag-chip bookmarker-tag-active",
				text: `${this.domainFilter} ✕`,
			});
			chip.addEventListener("click", () => {
				this.domainFilter = "";
				this.rebuild();
			});
		}

		if (this.relatedTo) {
			const chip = toolbar.createSpan({
				cls: "bookmarker-tag-chip bookmarker-tag-active",
				text: `Related to ${this.relatedTo.title} ✕`,
			});
			chip.addEventListener("click", () => {
				this.relatedTo = null;
				this.rebuild();
			});
		}

		const searchInput = toolbar.createEl("input", {
			cls: "bookmarker-search",
			attr: { type: "search", placeholder: "Search bookmarks…" },
		});
		searchInput.addEventListener("input", () => {
			this.search = searchInput.value.toLowerCase().trim();
			this.renderGrid();
		});

		const folders = unique(this.items.map((i) => i.folder).filter(Boolean)).sort();
		const folderSel = toolbar.createEl("select", { cls: "bookmarker-folder-select" });
		folderSel.createEl("option", { value: "", text: "All folders" });
		for (const folder of folders) {
			folderSel.createEl("option", { value: folder, text: folder });
		}
		folderSel.addEventListener("change", () => {
			this.folderFilter = folderSel.value;
			this.renderGrid();
		});

		const types = unique(this.items.map((i) => i.type).filter(Boolean)).sort();
		const typeSel = toolbar.createEl("select", { cls: "bookmarker-type-select" });
		typeSel.createEl("option", { value: "", text: "All types" });
		for (const type of types) typeSel.createEl("option", { value: type, text: type });
		typeSel.value = this.typeFilter;
		typeSel.addEventListener("change", () => {
			this.typeFilter = typeSel.value;
			this.renderGrid();
		});

		const favChip = toolbar.createSpan({
			cls: "bookmarker-tag-chip",
			text: "★ Favorites",
		});
		if (this.favoritesOnly) favChip.addClass("bookmarker-tag-active");
		favChip.addEventListener("click", () => {
			this.favoritesOnly = !this.favoritesOnly;
			favChip.toggleClass("bookmarker-tag-active", this.favoritesOnly);
			this.renderGrid();
		});

		const brokenChip = toolbar.createSpan({
			cls: "bookmarker-tag-chip",
			text: "Broken",
		});
		if (this.brokenOnly) brokenChip.addClass("bookmarker-tag-active");
		brokenChip.addEventListener("click", () => {
			this.brokenOnly = !this.brokenOnly;
			brokenChip.toggleClass("bookmarker-tag-active", this.brokenOnly);
			this.renderGrid();
		});

		const showHiddenChip = toolbar.createSpan({
			cls: "bookmarker-tag-chip",
			text: "Hidden",
		});
		if (this.showHidden) showHiddenChip.addClass("bookmarker-tag-active");
		showHiddenChip.addEventListener("click", () => {
			const lockHash = this.plugin.settings.hiddenLockHash;
			// Turning off, no lock, or already unlocked this session → toggle directly.
			if (this.showHidden || !lockHash || this.hiddenUnlocked) {
				this.showHidden = !this.showHidden;
				showHiddenChip.toggleClass("bookmarker-tag-active", this.showHidden);
				this.renderGrid();
				return;
			}
			// Locked and turning on → require the password first.
			new PasswordPromptModal(this.app, (entered) => {
				void (async () => {
					try {
						if ((await hashPassword(entered)) !== lockHash) {
							new Notice("Incorrect password.");
							return;
						}
						this.hiddenUnlocked = true;
						this.showHidden = true;
						this.renderGrid();
					} catch {
						new Notice("Could not verify password.");
					}
				})();
			}).open();
		});

		const selectAll = toolbar.createEl("button", {
			cls: "bookmarker-toolbar-btn",
			text: "Select all",
		});
		selectAll.addEventListener("click", () => {
			for (const item of this.filtered()) this.selected.add(item.file.path);
			this.renderGrid();
		});

		const selectNone = toolbar.createEl("button", {
			cls: "bookmarker-toolbar-btn",
			text: "Select none",
		});
		selectNone.addEventListener("click", () => {
			this.selected.clear();
			this.renderGrid();
		});

		const deleteBrokenBtn = toolbar.createEl("button", {
			cls: "bookmarker-toolbar-btn bookmarker-delete-broken bookmarker-hidden",
			text: "Delete broken",
		});
		deleteBrokenBtn.addEventListener("click", () => void this.deleteBrokenSelected());
		this.deleteBrokenBtn = deleteBrokenBtn;

		const hideSelectedBtn = toolbar.createEl("button", {
			cls: "bookmarker-toolbar-btn bookmarker-hide-selected bookmarker-hidden",
			text: "Hide selected",
		});
		hideSelectedBtn.addEventListener("click", () => void this.hideSelected());
		this.hideSelectedBtn = hideSelectedBtn;

		const sizeSel = toolbar.createEl("select", { cls: "bookmarker-size-select" });
		for (const [value, label] of [
			["small", "Small cards"],
			["medium", "Medium cards"],
			["large", "Large cards"],
		] as const) {
			sizeSel.createEl("option", { value, text: label });
		}
		sizeSel.value = this.plugin.settings.cardSize;
		sizeSel.addEventListener("change", () => {
			const size = sizeSel.value;
			this.plugin.settings.cardSize =
				size === "small" || size === "large" ? size : "medium";
			void this.plugin.saveSettings();
			this.applyCardSize();
		});

		const sortSel = toolbar.createEl("select", { cls: "bookmarker-sort-select" });
		for (const [value, label] of [
			["added", "Added"],
			["modified", "Modified"],
			["az", "A → Z"],
			["za", "Z → A"],
		] as const) {
			sortSel.createEl("option", { value, text: label });
		}
		sortSel.value = this.plugin.settings.sortMode;
		sortSel.addEventListener("change", () => {
			const mode = sortSel.value;
			this.plugin.settings.sortMode =
				mode === "modified" || mode === "az" || mode === "za" ? mode : "added";
			void this.plugin.saveSettings();
			this.renderGrid();
		});

		// Quick toggle: card title source (frontmatter title vs file name).
		const titleSrc = toolbar.createEl("button", {
			cls: "bookmarker-toolbar-btn",
			text: this.plugin.settings.useFileNameAsTitle ? "Title: file name" : "Title: metadata",
		});
		titleSrc.addEventListener("click", () => {
			this.plugin.settings.useFileNameAsTitle = !this.plugin.settings.useFileNameAsTitle;
			void this.plugin.saveSettings();
			this.rebuild();
		});

		const refresh = toolbar.createEl("button", {
			cls: "bookmarker-toolbar-btn",
			text: "Refresh",
		});
		refresh.addEventListener("click", () => {
			this.relatedTo = null;
			this.rebuild();
		});

		this.countEl = toolbar.createSpan({ cls: "bookmarker-count" });

		this.tagSectionEl = this.contentEl.createDiv({ cls: "bookmarker-tag-section" });
		this.renderTagSection();
	}

	/**
	 * Tag filter, collapsed by default so it never buries the cards. Expanding shows a
	 * height-capped, scrollable panel of tags sorted by frequency, with an in-panel
	 * filter input. Re-renders in place (no full rebuild) so it keeps the selection.
	 */
	private renderTagSection(): void {
		this.tagSectionEl.empty();

		const counts = new Map<string, number>();
		for (const item of this.items) {
			for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
		const tags = [...counts.keys()].sort((a, b) =>
			this.tagSort === "alpha"
				? a.localeCompare(b)
				: (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b),
		);
		if (tags.length === 0) return;

		const header = this.tagSectionEl.createDiv({ cls: "bookmarker-tag-header" });
		const toggle = header.createSpan({
			cls: "bookmarker-tag-toggle",
			text: `${this.tagsExpanded ? "▾" : "▸"} Tags (${tags.length})`,
		});
		toggle.addEventListener("click", () => {
			this.tagsExpanded = !this.tagsExpanded;
			this.renderTagSection();
		});

		// When expanded, offer a sort order: by assignment count or alphabetical.
		if (this.tagsExpanded) {
			const sort = header.createEl("select", { cls: "bookmarker-tag-sort" });
			sort.createEl("option", { value: "count", text: "Most used" });
			sort.createEl("option", { value: "alpha", text: "A–Z" });
			sort.value = this.tagSort;
			sort.addEventListener("change", () => {
				this.tagSort = sort.value === "alpha" ? "alpha" : "count";
				this.renderTagSection();
			});
		}

		// When collapsed, surface the active tag so the filter stays visible.
		if (!this.tagsExpanded && this.tagFilter) {
			const active = header.createSpan({
				cls: "bookmarker-tag-chip bookmarker-tag-active",
				text: `${this.tagFilter} ✕`,
			});
			active.addEventListener("click", () => {
				this.tagFilter = "";
				this.renderTagSection();
				this.renderGrid();
			});
		}

		if (!this.tagsExpanded) return;

		const search = this.tagSectionEl.createEl("input", {
			cls: "bookmarker-tag-search",
			attr: { type: "search", placeholder: "Filter tags…" },
		});
		const panel = this.tagSectionEl.createDiv({ cls: "bookmarker-tag-filter" });
		const draw = (needle: string): void => {
			panel.empty();
			const shown = needle
				? tags.filter((t) => t.toLowerCase().includes(needle))
				: tags;
			for (const tag of shown) {
				const chip = panel.createSpan({ cls: "bookmarker-tag-chip" });
				chip.createSpan({
					cls: "bookmarker-tag-label",
					text: `${tag} (${counts.get(tag) ?? 0})`,
				});
				// Visible, tap-friendly rename/delete affordance (right-click is not
				// available on mobile, which the plugin must support).
				const edit = chip.createSpan({
					cls: "bookmarker-tag-edit",
					text: "✎",
					attr: { "aria-label": "Rename or delete tag", title: "Rename or delete tag" },
				});
				if (tag === this.tagFilter) chip.addClass("bookmarker-tag-active");
				chip.addEventListener("click", () => {
					this.tagFilter = this.tagFilter === tag ? "" : tag;
					panel
						.querySelectorAll(".bookmarker-tag-chip")
						.forEach((el) => el.removeClass("bookmarker-tag-active"));
					if (this.tagFilter) chip.addClass("bookmarker-tag-active");
					this.renderGrid();
				});
				edit.addEventListener("click", (event) => {
					// Don't let the rename tap also toggle the tag filter.
					event.stopPropagation();
					this.manageTag(tag);
				});
				chip.addEventListener("contextmenu", (event) => {
					event.preventDefault();
					this.manageTag(tag);
				});
			}
		};
		draw("");
		search.addEventListener("input", () => draw(search.value.toLowerCase().trim()));
	}

	/** Right-click a tag: replace it everywhere with another, or delete it everywhere. */
	private manageTag(tag: string): void {
		const usage = countTagUsage(this.app, this.plugin.settings, tag);
		new ManageTagModal(this.app, {
			tag,
			usage,
			onReplace: (replacement) => this.applyTagChange(tag, replacement),
			onDelete: () => this.applyTagChange(tag, null),
		}).open();
	}

	private async applyTagChange(oldTag: string, replacement: string | null): Promise<void> {
		try {
			const changed = await changeTagEverywhere(
				this.app,
				this.plugin.settings,
				oldTag,
				replacement,
			);
			// Keep the active filter coherent with the rename/removal.
			if (this.tagFilter.toLowerCase() === oldTag.toLowerCase()) {
				this.tagFilter = replacement ?? "";
			}
			new Notice(
				replacement
					? `Renamed "${oldTag}" → "${replacement}" on ${changed} bookmark(s).`
					: `Removed "${oldTag}" from ${changed} bookmark(s).`,
			);
			// Rebuild so the tag panel drops/updates the affected chip.
			this.rebuild();
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			new Notice(`Tag update failed: ${msg}`);
		}
	}

	private renderGrid(): void {
		this.gridEl.empty();
		const items = this.filtered();
		this.countEl.setText(`${items.length} bookmark${items.length === 1 ? "" : "s"}`);
		this.deleteBrokenBtn.toggleClass(
			"bookmarker-hidden",
			!(this.brokenOnly && this.selected.size > 0),
		);
		this.hideSelectedBtn.toggleClass(
			"bookmarker-hidden",
			this.selected.size === 0,
		);
		if (items.length === 0) {
			this.gridEl.createDiv({
				cls: "bookmarker-empty",
				text: this.items.length ? "No matches." : "No bookmarks yet.",
			});
			return;
		}
		for (const item of items) this.renderCard(item);
	}

	private filtered(): BookmarkItem[] {
		if (this.relatedTo) return this.relatedItems(this.relatedTo);
		// Fuzzy match (typo/word-order tolerant) over title, domain, url, tags, description.
		const matcher = this.search ? prepareFuzzySearch(this.search) : null;
		const result = this.items.filter((item) => {
			if (item.hidden && !this.showHidden) return false;
			// Category scope: constrain to the entered category unless scope is global.
			if (
				this.searchScope === "category" &&
				this.activeCategory !== null &&
				item.folder !== this.activeCategory
			) {
				return false;
			}
			if (
				this.domainFilter &&
				item.domain.toLowerCase().replace(/^www\./, "") !== this.domainFilter
			) {
				return false;
			}
			if (this.folderFilter && item.folder !== this.folderFilter) return false;
			if (this.typeFilter && item.type !== this.typeFilter) return false;
			if (this.favoritesOnly && !item.favorite) return false;
			if (this.brokenOnly && !item.broken) return false;
			if (this.tagFilter && !item.tags.includes(this.tagFilter)) return false;
			if (matcher && !matcher(haystack(item))) return false;
			return true;
		});
		return this.sortItems(result);
	}

	/** Order the cards by the chosen sort mode (added/modified date, or title A–Z/Z–A). */
	private sortItems(items: BookmarkItem[]): BookmarkItem[] {
		const byTitle = (a: BookmarkItem, b: BookmarkItem): number =>
			a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
		switch (this.plugin.settings.sortMode) {
			case "modified":
				return items.sort((a, b) => b.modified - a.modified);
			case "az":
				return items.sort(byTitle);
			case "za":
				return items.sort((a, b) => byTitle(b, a));
			default:
				return items.sort((a, b) => b.created.localeCompare(a.created));
		}
	}

	/** Bookmarks related to the source, ranked by shared tags, then domain, then type. */
	private relatedItems(source: BookmarkItem): BookmarkItem[] {
		const srcTags = new Set(source.tags.map((t) => t.toLowerCase()));
		const srcDomain = source.domain.toLowerCase().replace(/^www\./, "");
		const scored = this.items
			.filter((c) => {
				if (c.file.path === source.file.path) return false;
				if (c.hidden && !this.showHidden) return false;
				return true;
			})
			.map((c) => {
				const sharedTags = c.tags.filter((t) => srcTags.has(t.toLowerCase())).length;
				const cDomain = c.domain.toLowerCase().replace(/^www\./, "");
				const sameDomain = srcDomain && cDomain === srcDomain ? 1 : 0;
				const sameType = c.type === source.type ? 1 : 0;
				return { item: c, sharedTags, sameDomain, sameType };
			})
			// Include on at least one shared tag or the same domain; type alone is too broad.
			.filter((s) => s.sharedTags >= 1 || s.sameDomain === 1);
		scored.sort(
			(a, b) =>
				b.sharedTags - a.sharedTags ||
				b.sameDomain - a.sameDomain ||
				b.sameType - a.sameType ||
				b.item.created.localeCompare(a.item.created),
		);
		return scored.slice(0, MAX_RELATED).map((s) => s.item);
	}

	private renderCard(item: BookmarkItem): void {
		const card = this.gridEl.createDiv({ cls: "bookmarker-card" });

		const cover = card.createDiv({ cls: "bookmarker-card-cover" });

		// Checkbox and star live on the card (not the cover) so they sit in the
		// small strip above the image instead of glued to its top edge.
		const select = card.createEl("input", {
			cls: "bookmarker-card-select",
			attr: { type: "checkbox", "aria-label": "Select bookmark" },
		});
		select.checked = this.selected.has(item.file.path);
		select.addEventListener("click", (event) => event.stopPropagation());
		select.addEventListener("change", () => {
			if (select.checked) this.selected.add(item.file.path);
			else this.selected.delete(item.file.path);
		});

		if (item.image && isSafeRemoteUrl(item.image)) {
			cover.createEl("img", { attr: { src: item.image, loading: "lazy" } });
		} else {
			cover.addClass("bookmarker-card-cover-empty");
			cover.setText(item.domain || "No cover");
		}

		const star = card.createSpan({
			cls: "bookmarker-card-star",
			text: item.favorite ? "★" : "☆",
		});
		if (item.favorite) star.addClass("bookmarker-card-star-on");
		let busy = false;
		star.addEventListener("click", (event) => {
			event.stopPropagation();
			if (busy) return;
			busy = true;
			const next = !item.favorite;
			void this.app.fileManager
				.processFrontMatter(item.file, (fm: Record<string, unknown>) => {
					fm.favorite = next;
				})
				.then(() => {
					// Update in-memory state only after the write succeeds.
					item.favorite = next;
					this.renderGrid();
				})
				.catch((err: unknown) => {
					const msg = err instanceof Error ? err.message : String(err);
					new Notice(`Failed to update favorite: ${msg}`);
				})
				.finally(() => {
					busy = false;
				});
		});

		if (item.type && item.type !== "link") {
			cover.createSpan({ cls: "bookmarker-card-type", text: item.type });
		}
		if (item.broken) {
			cover.createSpan({ cls: "bookmarker-card-broken", text: "broken" });
		}
		if (item.hidden && this.showHidden) {
			card.addClass("bookmarker-card--hidden");
			cover.createSpan({ cls: "bookmarker-card-hidden-badge", text: "hidden" });
		}

		card.createDiv({ cls: "bookmarker-card-title", text: item.title });
		if (item.domain) {
			card.createDiv({ cls: "bookmarker-card-domain", text: item.domain });
		}
		if (item.tags.length) {
			const tagsEl = card.createDiv({ cls: "bookmarker-card-tags" });
			for (const tag of item.tags.slice(0, MAX_CARD_TAGS)) {
				tagsEl.createSpan({ cls: "bookmarker-tag-chip", text: tag });
			}
		}

		card.addEventListener("click", () => {
			void this.app.workspace.getLeaf(false).openFile(item.file);
		});

		card.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			this.showCardMenu(event, item);
		});
	}

	private showCardMenu(event: MouseEvent, item: BookmarkItem): void {
		const menu = new Menu();
		menu.addItem((i) =>
			i
				.setTitle("Open URL")
				.setIcon("external-link")
				.onClick(() => window.open(item.url, "_blank")),
		);
		menu.addItem((i) =>
			i
				.setTitle("Show related")
				.setIcon("layers")
				.onClick(() => this.showRelated(item)),
		);
		menu.addItem((i) =>
			i
				.setTitle("Refresh card")
				.setIcon("refresh-cw")
				.onClick(() => void refreshBookmarkCard(this.plugin, item.file)),
		);
		menu.addItem((i) =>
			i
				.setTitle("Move to category…")
				.setIcon("folder")
				.onClick(() => this.moveToCategory(item)),
		);
		menu.addItem((i) =>
			i
				.setTitle("Add note")
				.setIcon("pencil")
				.onClick(() => this.addNote(item)),
		);
		menu.addItem((i) =>
			i
				.setTitle("Regenerate tags")
				.setIcon("tags")
				.onClick(() => void this.regenerateTags(item)),
		);
		menu.addItem((i) =>
			i
				.setTitle(item.hidden ? "Unhide" : "Hide")
				.setIcon(item.hidden ? "eye" : "eye-off")
				.onClick(() => void this.toggleHidden(item)),
		);
		menu.addSeparator();
		menu.addItem((i) =>
			i
				.setTitle("Delete")
				.setIcon("trash-2")
				.onClick(() => void this.deleteBookmark(item)),
		);
		menu.showAtMouseEvent(event);
	}

	/** Enter related mode: the board shows the bookmarks related to this one. */
	private showRelated(item: BookmarkItem): void {
		this.relatedTo = item;
		this.viewMode = "cards";
		this.rebuild();
	}

	private addNote(item: BookmarkItem): void {
		new AnnotateModal(this.app, item.title, (text) => {
			void appendNote(this.app, item.file, text).catch((error: unknown) => {
				const msg = error instanceof Error ? error.message : String(error);
				new Notice(`Add note failed: ${msg}`);
			});
		}).open();
	}

	private async deleteBookmark(item: BookmarkItem): Promise<void> {
		try {
			// Recoverable: honours the user's "Deleted files" preference. The board
			// auto-refreshes from the vault delete event.
			await this.app.fileManager.trashFile(item.file);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			new Notice(`Delete failed: ${msg}`);
		}
	}

	private async toggleHidden(item: BookmarkItem): Promise<void> {
		const next = !item.hidden;
		try {
			await this.app.fileManager.processFrontMatter(
				item.file,
				(fm: Record<string, unknown>) => {
					if (next) fm.hidden = true;
					else delete fm.hidden;
				},
			);
			item.hidden = next;
			this.renderGrid();
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			new Notice(`Failed to update hidden: ${msg}`);
		}
	}

	private async deleteBrokenSelected(): Promise<void> {
		const targets = this.items.filter(
			(i) => i.broken && this.selected.has(i.file.path),
		);
		if (targets.length === 0) return;
		let failed = 0;
		for (const item of targets) {
			try {
				await this.app.fileManager.trashFile(item.file);
				this.selected.delete(item.file.path);
			} catch {
				failed++;
			}
		}
		if (failed > 0) new Notice(`${failed} deletion${failed === 1 ? "" : "s"} failed.`);
	}

	private async hideSelected(): Promise<void> {
		const targets = this.items.filter((i) => this.selected.has(i.file.path));
		if (targets.length === 0) return;
		let failed = 0;
		for (const item of targets) {
			try {
				await this.app.fileManager.processFrontMatter(
					item.file,
					(fm: Record<string, unknown>) => {
						fm.hidden = true;
					},
				);
				item.hidden = true;
			} catch {
				failed++;
			}
		}
		this.selected.clear();
		if (failed > 0)
			new Notice(`${failed} bookmark${failed === 1 ? "" : "s"} could not be hidden.`);
		this.renderGrid();
	}

	private moveToCategory(item: BookmarkItem): void {
		const folders = readTaxonomy(this.app, this.plugin.settings.rootFolder).folders;
		new FolderSuggestModal(this.app, folders, (rel) => {
			void this.doMove(item, sanitizeFolderPath(rel));
		}).open();
	}

	private async doMove(item: BookmarkItem, rel: string): Promise<void> {
		const root = normalizePath(this.plugin.settings.rootFolder);
		const targetDir = rel ? normalizePath(`${root}/${rel}`) : root;
		const newPath = normalizePath(`${targetDir}/${item.file.basename}.md`);
		if (newPath === item.file.path) return;
		try {
			// Create the category folder (and parents) when it is new.
			await ensureFolder(this.app, targetDir);
			await this.app.fileManager.renameFile(item.file, newPath);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			new Notice(`Move failed: ${msg}`);
		}
	}

	private async regenerateTags(item: BookmarkItem): Promise<void> {
		const notice = new Notice("Fetching tags…", 0);
		try {
			const html = await fetchHtml(item.url);
			const metadata = parseMetadata(html, item.url, this.plugin.settings.excerptLength);
			const taxonomy = readTaxonomy(this.app, this.plugin.settings.rootFolder);
			const classification = await classifyBookmark(
				this.plugin.settings,
				{
					url: item.url,
					domain: metadata.domain,
					title: metadata.title,
					description: metadata.description,
					excerpt: metadata.excerpt,
				},
				taxonomy,
			);
			notice.hide();
			new RegenerateTagsModal(this.app, item.title, classification.tags, (tags) => {
				void this.app.fileManager
					.processFrontMatter(item.file, (fm: Record<string, unknown>) => {
						fm.tags = tags;
					})
					.catch((error: unknown) => {
						const msg = error instanceof Error ? error.message : String(error);
						new Notice(`Failed to update tags: ${msg}`);
					});
			}).open();
		} catch (error) {
			notice.hide();
			const msg = error instanceof Error ? error.message : String(error);
			new Notice(`Regenerate tags failed: ${msg}`);
		}
	}

}

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/** The text a fuzzy search runs against for one bookmark. */
function haystack(item: BookmarkItem): string {
	return `${item.title} ${item.domain} ${item.url} ${item.tags.join(" ")} ${item.description}`;
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values));
}
