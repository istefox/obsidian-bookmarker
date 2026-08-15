import { Notice, Plugin } from "obsidian";
import {
	BookmarkerSettings,
	BookmarkerSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";
import { CaptureModal } from "./capture-modal";
import { captureBookmark } from "./capture";
import { isHttpUrl } from "./url-safety";
import { BOOKMARK_VIEW_TYPE, BookmarkView } from "./bookmark-view";
import { BookmarkBar } from "./bookmark-bar";
import { checkBrokenLinks } from "./link-check";
import { ImportModal } from "./import-modal";
import { fetchRaindropItems } from "./raindrop";
import { importBookmarks } from "./import-writer";
import { BookmarkSuggestModal, listBookmarkFiles } from "./bookmark-suggest";
import { deduplicateBookmarks } from "./organize-dedup";
import { cleanUpBrokenLinks } from "./organize-broken";
import { bulkRetagBookmarks, suggestFolderMoves } from "./organize-ai";

export default class BookmarkerPlugin extends Plugin {
	settings!: BookmarkerSettings;
	/** The browser-style top bar. A Component child, so it unloads with the plugin. */
	private bar!: BookmarkBar;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addChild((this.bar = new BookmarkBar(this)));

		this.addCommand({
			id: "bookmark-a-url",
			name: "Bookmark a URL",
			callback: async () => {
				const initialUrl = await this.readClipboardUrl();
				new CaptureModal(
					this.app,
					this,
					(url) => {
						void captureBookmark(this, url);
					},
					initialUrl,
				).open();
			},
		});

		// One-click entry point: obsidian://bookmark?url=<encoded>
		// Fired by the companion browser extension (desktop) or an Apple Shortcut
		// (iOS/iPad Share Sheet). See ADR-001.
		this.registerObsidianProtocolHandler("bookmark", (params) => {
			const url = (params.url ?? "").trim();
			if (!isHttpUrl(url)) {
				new Notice("Bookmarker: obsidian://bookmark needs a valid HTTP(s) URL.");
				return;
			}
			void captureBookmark(this, url);
		});

		// Raindrop-like board: a grid of cover cards for the saved bookmarks.
		this.registerView(
			BOOKMARK_VIEW_TYPE,
			(leaf) => new BookmarkView(leaf, this),
		);
		this.addRibbonIcon("bookmark", "Open bookmarks board", () => {
			void this.openBoard();
		});
		this.addCommand({
			id: "open-bookmarks-board",
			name: "Open bookmarks board",
			callback: () => void this.openBoard(),
		});
		this.addRibbonIcon("panel-top", "Toggle bookmark bar", () => {
			void this.toggleBookmarkBar();
		});
		this.addCommand({
			id: "toggle-bookmark-bar",
			name: "Toggle bookmark bar",
			callback: () => void this.toggleBookmarkBar(),
		});
		this.addCommand({
			id: "check-broken-links",
			name: "Check for broken links",
			callback: () => void this.runBrokenLinkCheck(),
		});
		this.addCommand({
			id: "organize-deduplicate",
			name: "Deduplicate bookmarks",
			callback: () => void deduplicateBookmarks(this),
		});
		this.addCommand({
			id: "organize-fix-broken-links",
			name: "Clean up broken links",
			callback: () => void cleanUpBrokenLinks(this),
		});
		this.addCommand({
			id: "organize-retag",
			name: "Bulk re-tag selected bookmarks",
			callback: () => void bulkRetagBookmarks(this),
		});
		this.addCommand({
			id: "organize-suggest-folders",
			name: "Suggest folder moves for selected bookmarks",
			callback: () => void suggestFolderMoves(this),
		});
		this.addCommand({
			id: "import-bookmarks",
			name: "Import bookmarks…",
			callback: () => new ImportModal(this.app, this).open(),
		});
		this.addCommand({
			id: "import-from-raindrop",
			name: "Import from Raindrop",
			callback: () => void this.runRaindropImport(),
		});
		this.addCommand({
			id: "insert-bookmark-link",
			name: "Insert bookmark link",
			editorCallback: (editor) => {
				const refs = listBookmarkFiles(this.app, this.settings);
				if (refs.length === 0) {
					new Notice("Bookmarker: no bookmarks yet.");
					return;
				}
				new BookmarkSuggestModal(this.app, refs, (file) => {
					editor.replaceSelection(`[[${file.basename}]]`);
				}).open();
			},
		});

		this.addSettingTab(new BookmarkerSettingTab(this.app, this));
	}

	onunload(): void {}

	/** Show or hide the top bar. The setting doubles as the open/collapsed state. */
	private async toggleBookmarkBar(): Promise<void> {
		this.settings.showBookmarkBar = !this.settings.showBookmarkBar;
		await this.saveSettings();
	}

	private async runBrokenLinkCheck(): Promise<void> {
		const notice = new Notice("Checking links…", 0);
		try {
			const { checked, broken, unreachable } = await checkBrokenLinks(
				this.app,
				this.settings,
				(done, total) => notice.setMessage(`Checking links ${done}/${total}…`),
			);
			notice.hide();
			const tail = unreachable ? `, ${unreachable} unreachable (unchanged)` : "";
			new Notice(`Checked ${checked} bookmark(s): ${broken} broken${tail}.`);
		} catch (error) {
			notice.hide();
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Link check failed: ${message}`);
		}
	}

	private async runRaindropImport(): Promise<void> {
		const token = this.settings.raindropToken;
		if (!token) {
			new Notice("Bookmarker: set your Raindrop API token in settings first.");
			return;
		}
		const notice = new Notice("Fetching from Raindrop…", 0);
		try {
			const items = await fetchRaindropItems(token, (count) =>
				notice.setMessage(`Fetching from Raindrop… ${count} found`),
			);
			if (items.length === 0) {
				notice.hide();
				new Notice("Bookmarker: no bookmarks found in Raindrop.");
				return;
			}
			const { imported, skipped, failed } = await importBookmarks(
				this.app,
				this.settings,
				items,
				(done, total) => notice.setMessage(`Importing ${done}/${total}…`),
			);
			notice.hide();
			const tail = failed ? `, ${failed} failed` : "";
			new Notice(`Raindrop import: ${imported} imported, ${skipped} skipped${tail}.`);
		} catch (error) {
			notice.hide();
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Raindrop import failed: ${message}`);
		}
	}

	/**
	 * Reveal the bookmarks board, creating its leaf if needed. Optionally drill straight
	 * into one domain or one category ("" = Uncategorized, so check for undefined).
	 */
	async openBoard(filter?: { domain?: string; category?: string }): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(BOOKMARK_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: BOOKMARK_VIEW_TYPE, active: true });
		}
		await workspace.revealLeaf(leaf);
		if (!(leaf.view instanceof BookmarkView)) return;
		if (filter?.domain) leaf.view.filterByDomain(filter.domain);
		else if (filter?.category !== undefined) leaf.view.filterByCategory(filter.category);
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<BookmarkerSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Covers every input the bar reads — visibility, root folder, category styles,
		// favourites cap — without threading a callback through each settings control.
		this.bar?.sync();
	}

	/** Prefill the modal when the clipboard holds an http(s) URL. Safe on mobile. */
	private async readClipboardUrl(): Promise<string> {
		try {
			const clip = (await navigator.clipboard.readText())?.trim();
			return clip && /^https?:\/\//i.test(clip) ? clip : "";
		} catch {
			// Clipboard API unavailable or permission denied — ignore.
			return "";
		}
	}
}
