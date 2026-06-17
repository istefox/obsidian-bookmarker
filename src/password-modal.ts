import { App, Modal, Notice, Setting } from "obsidian";

/** SHA-256 hex digest of a password. Soft lock only — not encryption. */
export async function hashPassword(password: string): Promise<string> {
	const data = new TextEncoder().encode(password);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Prompt for the Hidden-cards password. Calls onSubmit with the entered value. */
export class PasswordPromptModal extends Modal {
	private value = "";
	private readonly onSubmit: (password: string) => void;

	constructor(app: App, onSubmit: (password: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Hidden cards locked" });
		contentEl.createEl("p", {
			cls: "bookmarker-domain-notice",
			text: "Enter the password to show hidden bookmarks.",
		});

		new Setting(contentEl).addText((text) => {
			text.inputEl.type = "password";
			text.setPlaceholder("Password…").onChange((v) => {
				this.value = v;
			});
			text.inputEl.addClass("bookmarker-wide-input");
			text.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					this.submit();
				}
			});
			window.setTimeout(() => text.inputEl.focus(), 0);
		});

		new Setting(contentEl)
			.addButton((button) => button.setButtonText("Unlock").setCta().onClick(() => this.submit()))
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()));
	}

	private submit(): void {
		if (!this.value) {
			new Notice("Please enter a password.");
			return;
		}
		const value = this.value;
		this.close();
		this.onSubmit(value);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Set or change the Hidden-cards password. Requires a matching confirmation. */
export class SetPasswordModal extends Modal {
	private password = "";
	private confirm = "";
	private readonly onSet: (password: string) => void;

	constructor(app: App, onSet: (password: string) => void) {
		super(app);
		this.onSet = onSet;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Hidden cards password" });
		contentEl.createEl("p", {
			cls: "bookmarker-domain-notice",
			text: "Soft lock only. Notes stay readable as Markdown files in your vault.",
		});

		new Setting(contentEl).setName("Password").addText((text) => {
			text.inputEl.type = "password";
			text.setPlaceholder("Password…").onChange((v) => {
				this.password = v;
			});
			text.inputEl.addClass("bookmarker-wide-input");
			window.setTimeout(() => text.inputEl.focus(), 0);
		});

		new Setting(contentEl).setName("Confirm").addText((text) => {
			text.inputEl.type = "password";
			text.setPlaceholder("Repeat password…").onChange((v) => {
				this.confirm = v;
			});
			text.inputEl.addClass("bookmarker-wide-input");
			text.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					this.submit();
				}
			});
		});

		new Setting(contentEl)
			.addButton((button) => button.setButtonText("Save").setCta().onClick(() => this.submit()))
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()));
	}

	private submit(): void {
		if (!this.password) {
			new Notice("Password cannot be empty.");
			return;
		}
		if (this.password !== this.confirm) {
			new Notice("Passwords do not match.");
			return;
		}
		const password = this.password;
		this.close();
		this.onSet(password);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
