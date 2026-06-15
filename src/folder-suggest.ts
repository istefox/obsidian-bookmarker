import { App, FuzzySuggestModal } from "obsidian";

/** Picks a destination category from the existing subfolders, plus the root. */
export class FolderSuggestModal extends FuzzySuggestModal<string> {
	private readonly folders: string[];
	private readonly onChoose: (folder: string) => void;

	constructor(app: App, folders: string[], onChoose: (folder: string) => void) {
		super(app);
		// "" is the root folder; show it first, then the existing subfolders.
		this.folders = ["", ...folders];
		this.onChoose = onChoose;
		this.setPlaceholder("Move to category…");
	}

	getItems(): string[] {
		return this.folders;
	}

	getItemText(folder: string): string {
		return folder === "" ? "(Root)" : folder;
	}

	onChooseItem(folder: string): void {
		this.onChoose(folder);
	}
}
