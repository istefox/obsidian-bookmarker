import { App, Modal, Setting } from "obsidian";
import type BookmarkerPlugin from "./main";
import { isHttpUrl } from "./url-safety";

/**
 * M1 capture modal: manual URL entry with inline validation.
 * The fetch/classify/review pipeline is wired in later milestones; for now the
 * modal validates the URL and hands it to `onSubmit`.
 */
export class CaptureModal extends Modal {
	private url: string;
	private readonly plugin: BookmarkerPlugin;
	private readonly onSubmit: (url: string) => void;

	constructor(
		app: App,
		plugin: BookmarkerPlugin,
		onSubmit: (url: string) => void,
		initialUrl = "",
	) {
		super(app);
		this.plugin = plugin;
		this.onSubmit = onSubmit;
		this.url = initialUrl;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Bookmark a URL" });

		const errorEl = contentEl.createEl("p", {
			cls: "bookmarker-modal-error",
		});

		const submit = () => {
			if (!this.isValidUrl(this.url)) {
				errorEl.setText("Enter a valid HTTP(s) URL.");
				return;
			}
			this.close();
			this.onSubmit(this.url);
		};

		new Setting(contentEl)
			.setName("URL")
			.setDesc("Paste the page address you want to bookmark.")
			.addText((text) => {
				text
					.setPlaceholder("https://example.com/article")
					.setValue(this.url)
					.onChange((value) => {
						this.url = value.trim();
						errorEl.setText("");
					});
				text.inputEl.addClass("bookmarker-url-input");
				text.inputEl.addEventListener("keydown", (event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						submit();
					}
				});
				window.setTimeout(() => text.inputEl.focus(), 0);
			});

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText("Save").setCta().onClick(submit),
			)
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => this.close()),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private isValidUrl(value: string): boolean {
		return isHttpUrl(value);
	}
}
