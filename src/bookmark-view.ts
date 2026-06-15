import { debounce, ItemView, Notice, normalizePath, TFile, WorkspaceLeaf } from "obsidian";
import type BookmarkerPlugin from "./main";
import { isSafeRemoteUrl } from "./url-safety";

export const BOOKMARK_VIEW_TYPE = "bookmarker-grid";
const MAX_CARD_TAGS = 4;

interface BookmarkItem {
	file: TFile;
	title: string;
	url: string;
	image: string;
	tags: string[];
	domain: string;
	folder: string;
	created: string;
	type: string;
	favorite: boolean;
	broken: boolean;
}

/** Raindrop-like board: a grid of cover cards for the saved bookmarks (read-only). */
export class BookmarkView extends ItemView {
	private readonly plugin: BookmarkerPlugin;
	private items: BookmarkItem[] = [];
	private search = "";
	private folderFilter = "";
	private tagFilter = "";
	private domainFilter = "";
	private typeFilter = "";
	private favoritesOnly = false;
	private brokenOnly = false;
	private gridEl!: HTMLElement;
	private countEl!: HTMLElement;

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

	/** Re-scan the vault and redraw the grid, keeping the toolbar and filters. */
	private refreshData(): void {
		this.loadBookmarks();
		this.renderGrid();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/** Filter the board to a single domain (www-insensitive) and redraw. */
	filterByDomain(domain: string): void {
		this.domainFilter = domain.toLowerCase().replace(/^www\./, "");
		this.rebuild();
	}

	/** Full rebuild: re-scan the vault and redraw toolbar + grid. */
	private rebuild(): void {
		this.contentEl.empty();
		this.contentEl.addClass("bookmarker-board");
		this.loadBookmarks();
		this.renderToolbar();
		this.gridEl = this.contentEl.createDiv({ cls: "bookmarker-grid" });
		this.renderGrid();
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
				title: asString(fm.title) || file.basename,
				url: asString(fm.url),
				image: asString(fm.image),
				tags: normalizeTags(fm.tags),
				domain: asString(fm.domain),
				folder: parent.startsWith(prefix) ? parent.slice(prefix.length) : "",
				created: asString(fm.created),
				type: asString(fm.type) || "link",
				favorite: fm.favorite === true,
				broken: fm.broken === true,
			});
		}
		items.sort((a, b) => b.created.localeCompare(a.created));
		this.items = items;
	}

	private renderToolbar(): void {
		const toolbar = this.contentEl.createDiv({ cls: "bookmarker-toolbar" });

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

		const refresh = toolbar.createEl("button", {
			cls: "bookmarker-refresh",
			text: "Refresh",
		});
		refresh.addEventListener("click", () => this.rebuild());

		this.countEl = toolbar.createSpan({ cls: "bookmarker-count" });

		const allTags: string[] = [];
		for (const item of this.items) allTags.push(...item.tags);
		const tags = unique(allTags).sort();
		if (tags.length) {
			const tagBar = this.contentEl.createDiv({ cls: "bookmarker-tag-filter" });
			for (const tag of tags) {
				const chip = tagBar.createSpan({ cls: "bookmarker-tag-chip", text: tag });
				if (tag === this.tagFilter) chip.addClass("bookmarker-tag-active");
				chip.addEventListener("click", () => {
					this.tagFilter = this.tagFilter === tag ? "" : tag;
					tagBar
						.querySelectorAll(".bookmarker-tag-chip")
						.forEach((el) => el.removeClass("bookmarker-tag-active"));
					if (this.tagFilter) chip.addClass("bookmarker-tag-active");
					this.renderGrid();
				});
			}
		}
	}

	private renderGrid(): void {
		this.gridEl.empty();
		const items = this.filtered();
		this.countEl.setText(`${items.length} bookmark${items.length === 1 ? "" : "s"}`);
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
		return this.items.filter((item) => {
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
			if (this.search) {
				const hay =
					`${item.title} ${item.domain} ${item.url} ${item.tags.join(" ")}`.toLowerCase();
				if (!hay.includes(this.search)) return false;
			}
			return true;
		});
	}

	private renderCard(item: BookmarkItem): void {
		const card = this.gridEl.createDiv({ cls: "bookmarker-card" });

		const cover = card.createDiv({ cls: "bookmarker-card-cover" });
		if (item.image && isSafeRemoteUrl(item.image)) {
			cover.createEl("img", { attr: { src: item.image, loading: "lazy" } });
		} else {
			cover.addClass("bookmarker-card-cover-empty");
			cover.setText(item.domain || "No cover");
		}

		const star = cover.createSpan({
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
	}
}

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function normalizeTags(value: unknown): string[] {
	const parts = Array.isArray(value)
		? value
		: typeof value === "string"
			? value.split(/[\s,]+/)
			: [];
	return parts.map((t) => String(t).replace(/^#/, "").trim()).filter(Boolean);
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values));
}
