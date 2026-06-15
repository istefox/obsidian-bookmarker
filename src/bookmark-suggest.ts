import { App, FuzzySuggestModal, normalizePath, TFile } from "obsidian";
import { BookmarkerSettings } from "./settings";

export interface BookmarkRef {
	file: TFile;
	title: string;
}

/** Every bookmark note in the vault (under the root folder, with the source marker). */
export function listBookmarkFiles(app: App, settings: BookmarkerSettings): BookmarkRef[] {
	const root = normalizePath(settings.rootFolder);
	const prefix = `${root}/`;
	const out: BookmarkRef[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (file.path !== root && !file.path.startsWith(prefix)) continue;
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm || fm.source !== "obsidian-bookmarker") continue;
		const title = typeof fm.title === "string" && fm.title ? fm.title : file.basename;
		out.push({ file, title });
	}
	out.sort((a, b) => a.title.localeCompare(b.title));
	return out;
}

/** Fuzzy picker over saved bookmarks; calls back with the chosen note's file. */
export class BookmarkSuggestModal extends FuzzySuggestModal<BookmarkRef> {
	private readonly refs: BookmarkRef[];
	private readonly onChoose: (file: TFile) => void;

	constructor(app: App, refs: BookmarkRef[], onChoose: (file: TFile) => void) {
		super(app);
		this.refs = refs;
		this.onChoose = onChoose;
		this.setPlaceholder("Insert link to bookmark…");
	}

	getItems(): BookmarkRef[] {
		return this.refs;
	}

	getItemText(ref: BookmarkRef): string {
		return ref.title;
	}

	onChooseItem(ref: BookmarkRef): void {
		this.onChoose(ref.file);
	}
}
