import { App, FuzzySuggestModal, TFile } from "obsidian";
import { IMAGE_EXTENSIONS } from "./cover";

/** Every image in the vault; the assets folder sorts first, then by path. */
export function listVaultImages(app: App, assetsFolder: string): TFile[] {
	const prefix = assetsFolder ? `${assetsFolder}/` : "";
	const images = app.vault
		.getFiles()
		.filter((file) => IMAGE_EXTENSIONS.has(file.extension.toLowerCase()));
	images.sort((a, b) => {
		const aAsset = prefix && a.path.startsWith(prefix) ? 0 : 1;
		const bAsset = prefix && b.path.startsWith(prefix) ? 0 : 1;
		return aAsset - bAsset || a.path.localeCompare(b.path);
	});
	return images;
}

/** Fuzzy picker over the vault's images; calls back with the chosen file. */
export class ImageSuggestModal extends FuzzySuggestModal<TFile> {
	private readonly files: TFile[];
	private readonly onChoose: (file: TFile) => void;

	constructor(app: App, files: TFile[], onChoose: (file: TFile) => void) {
		super(app);
		this.files = files;
		this.onChoose = onChoose;
		this.setPlaceholder("Pick a vault image for the cover…");
	}

	getItems(): TFile[] {
		return this.files;
	}

	/** Full path, not basename: three "cover.png" must stay distinguishable. */
	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onChoose(file);
	}
}
