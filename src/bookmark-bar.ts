import { Component, debounce, Menu, Notice, setIcon } from "obsidian";
import type BookmarkerPlugin from "./main";
import { BookmarkItem, categoryNames, isUnderRoot, loadBookmarks } from "./bookmark-data";
import { renderCategoryIcon } from "./category-icon";
import { isSafeRemoteUrl } from "./url-safety";

/** Rows shown in a category dropdown before it degrades to an "Open in board" link. */
const MAX_MENU_ITEMS = 40;

/**
 * A browser-style bookmark bar pinned above the workspace (issue #58): starred
 * bookmarks as one-click buttons, then one button per category opening a dropdown.
 *
 * Obsidian has no API for a top bar, so the element is inserted as a sibling before
 * `.horizontal-main-container` inside `.app-container`. That container is a flex column
 * and the main container is `flex: 1 0 0`, so the bar takes its own row and the
 * workspace below shrinks — no overlay, no padding compensation. See ADR-004; if the
 * anchor ever disappears the bar simply does not mount.
 */
export class BookmarkBar extends Component {
	private readonly plugin: BookmarkerPlugin;
	private el: HTMLElement | null = null;
	private readonly scheduleRender = debounce(() => this.render(), 300);

	constructor(plugin: BookmarkerPlugin) {
		super();
		this.plugin = plugin;
	}

	onload(): void {
		this.plugin.app.workspace.onLayoutReady(() => this.sync());

		// Same wiring as the board: a bookmark saved, deleted, starred, or moved shows up
		// without a reload. "changed" fires once frontmatter is parsed.
		const refresh = (): void => {
			if (this.el) this.scheduleRender();
		};
		this.registerEvent(
			this.plugin.app.metadataCache.on("changed", (file) => {
				if (this.isUnderRoot(file.path)) refresh();
			}),
		);
		this.registerEvent(
			this.plugin.app.vault.on("create", (file) => {
				if (this.isUnderRoot(file.path)) refresh();
			}),
		);
		this.registerEvent(
			this.plugin.app.vault.on("delete", (file) => {
				if (this.isUnderRoot(file.path)) refresh();
			}),
		);
		this.registerEvent(
			this.plugin.app.vault.on("rename", (file, oldPath) => {
				if (this.isUnderRoot(file.path) || this.isUnderRoot(oldPath)) refresh();
			}),
		);
	}

	onunload(): void {
		this.unmount();
	}

	/** Mount, unmount, or redraw the bar to match the current setting. */
	sync(): void {
		if (!this.plugin.settings.showBookmarkBar) {
			this.unmount();
			return;
		}
		// saveSettings() can fire before the workspace exists; onLayoutReady calls us again.
		if (!this.plugin.app.workspace.layoutReady) return;
		if (!this.el && !this.mount()) return;
		this.render();
	}

	private isUnderRoot(path: string): boolean {
		return isUnderRoot(path, this.plugin.settings.rootFolder);
	}

	/** Insert the bar above the workspace. Returns false when the anchor is missing. */
	private mount(): boolean {
		// The root split's own document, not activeDocument: the bar belongs to the main
		// window, and sync() can fire while a popout window has focus.
		const doc = this.plugin.app.workspace.rootSplit.doc;
		const anchor = doc.querySelector<HTMLElement>(".horizontal-main-container");
		const parent = anchor?.parentElement;
		// A future Obsidian layout change lands here: no bar, no crash, no error spam.
		if (!anchor || !parent) return false;
		const bar = doc.createElement("div");
		bar.addClass("bookmarker-bar");
		parent.insertBefore(bar, anchor);
		this.el = bar;
		return true;
	}

	private unmount(): void {
		this.el?.detach();
		this.el = null;
	}

	private render(): void {
		const el = this.el;
		if (!el) return;
		el.empty();

		const items = loadBookmarks(this.plugin.app, this.plugin.settings).filter(
			(item) => !item.hidden,
		);
		if (items.length === 0) {
			el.createSpan({ cls: "bookmarker-bar-empty", text: "No bookmarks yet." });
			return;
		}

		const favorites = items
			.filter((item) => item.favorite)
			.slice(0, this.plugin.settings.bookmarkBarMaxFavorites);
		for (const item of favorites) this.renderFavorite(el, item);

		const categories = categoryNames(items);
		if (favorites.length && categories.length) {
			el.createSpan({ cls: "bookmarker-bar-sep" });
		}
		for (const category of categories) {
			this.renderCategory(
				el,
				category,
				items.filter((item) => item.folder === category),
			);
		}
	}

	private renderFavorite(bar: HTMLElement, item: BookmarkItem): void {
		const button = bar.createEl("button", {
			cls: "bookmarker-bar-item",
			attr: { title: `${item.title}\n${item.url}` },
		});
		this.renderFavicon(button.createSpan({ cls: "bookmarker-bar-icon" }), item);
		button.createSpan({ cls: "bookmarker-bar-label", text: item.title });

		button.addEventListener("click", (event) => this.openBookmark(item, event));
		button.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			this.showItemMenu(event, item);
		});
	}

	/**
	 * The page's own favicon, re-checked on read because frontmatter is hand-editable.
	 * It is used unproxied: the wsrv.nl wrapper resizes to 1200px, useless for a 16px
	 * icon. A host that stops serving it degrades to a generic glyph.
	 */
	private renderFavicon(host: HTMLElement, item: BookmarkItem): void {
		if (!isSafeRemoteUrl(item.favicon)) {
			setIcon(host, "link");
			return;
		}
		const img = host.createEl("img", {
			attr: { src: item.favicon, alt: "", loading: "lazy" },
		});
		// setIcon appends rather than replaces, so drop the dead <img> first.
		img.addEventListener("error", () => {
			host.empty();
			setIcon(host, "link");
		});
	}

	private renderCategory(bar: HTMLElement, category: string, items: BookmarkItem[]): void {
		const label = category || "Uncategorized";
		const style = this.plugin.settings.categoryStyles[category] ?? { color: "", icon: "" };
		const button = bar.createEl("button", {
			cls: "bookmarker-bar-folder",
			attr: { title: `${label} — ${items.length} bookmark${items.length === 1 ? "" : "s"}` },
		});
		if (style.color) button.setCssProps({ "--bm-cat-color": style.color });

		renderCategoryIcon(button.createSpan({ cls: "bookmarker-bar-icon" }), style.icon || "folder");
		button.createSpan({ cls: "bookmarker-bar-label", text: label });
		button.createSpan({ cls: "bookmarker-bar-caret", text: "▾" });

		button.addEventListener("click", () => {
			const menu = new Menu();
			for (const item of items.slice(0, MAX_MENU_ITEMS)) {
				menu.addItem((entry) =>
					entry
						.setTitle(item.title)
						.setIcon("link")
						.onClick((event) => this.openBookmark(item, event)),
				);
			}
			if (items.length > MAX_MENU_ITEMS) menu.addSeparator();
			menu.addItem((entry) =>
				entry
					.setTitle("Open in board")
					.setIcon("layout-grid")
					.onClick(() => void this.plugin.openBoard({ category })),
			);
			const rect = button.getBoundingClientRect();
			menu.showAtPosition({ x: rect.left, y: rect.bottom });
		});
	}

	private showItemMenu(event: MouseEvent, item: BookmarkItem): void {
		const menu = new Menu();
		menu.addItem((entry) =>
			entry
				.setTitle("Open URL")
				.setIcon("external-link")
				.onClick(() => window.open(item.url, "_blank")),
		);
		menu.addItem((entry) =>
			entry
				.setTitle("Open note")
				.setIcon("file-text")
				.onClick(() => void this.plugin.app.workspace.getLeaf(false).openFile(item.file)),
		);
		menu.addItem((entry) =>
			entry
				.setTitle("Remove from favorites")
				.setIcon("star-off")
				.onClick(() => void this.unfavorite(item)),
		);
		menu.showAtMouseEvent(event);
	}

	/** Plain click opens the site; Cmd/Ctrl (or middle) click opens the note instead. */
	private openBookmark(item: BookmarkItem, event: MouseEvent | KeyboardEvent): void {
		if (event.metaKey || event.ctrlKey) {
			void this.plugin.app.workspace.getLeaf(false).openFile(item.file);
			return;
		}
		if (!item.url) {
			void this.plugin.app.workspace.getLeaf(false).openFile(item.file);
			return;
		}
		window.open(item.url, "_blank");
	}

	private async unfavorite(item: BookmarkItem): Promise<void> {
		try {
			await this.plugin.app.fileManager.processFrontMatter(
				item.file,
				(fm: Record<string, unknown>) => {
					fm.favorite = false;
				},
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Failed to update favorite: ${message}`);
		}
	}
}
