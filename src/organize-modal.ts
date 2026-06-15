import { App, Modal, Setting } from "obsidian";

/** A per-row choice, e.g. the remediation for a broken link. */
export interface OrganizeRowOption {
	value: string;
	label: string;
	/** Rendered but unselectable (e.g. no Wayback snapshot available). */
	disabled?: boolean;
}

/** One proposed change shown in the review modal. */
export interface OrganizeRow {
	id: string;
	/** Primary text (usually the note title). */
	label: string;
	/** Secondary text or diff, e.g. "tech → tech/ai" or "old → new tags". */
	detail: string;
	/** Initial checkbox state. */
	selected: boolean;
	/** Flag destructive rows (deletions) visually. */
	destructive?: boolean;
	/** Optional per-row selector; first non-disabled option is the fallback default. */
	options?: OrganizeRowOption[];
	/** Initially selected option value (defaults to first enabled option). */
	optionValue?: string;
}

/** What the modal returns for one approved row. */
export interface OrganizeSelection {
	id: string;
	/** The chosen option value when the row had options. */
	optionValue?: string;
}

interface OrganizeModalOptions {
	title: string;
	intro?: string;
	rows: OrganizeRow[];
	applyLabel?: string;
	onApply: (selected: OrganizeSelection[]) => void | Promise<void>;
}

/**
 * Generic review window for the Organize commands: a scrollable list of proposed
 * changes, each with a pre-selected checkbox and an optional per-row selector.
 * Applies only the checked rows.
 */
export class OrganizeModal extends Modal {
	private readonly opts: OrganizeModalOptions;
	private readonly checked = new Map<string, boolean>();
	private readonly choice = new Map<string, string>();
	private applyButton: HTMLButtonElement | null = null;

	constructor(app: App, opts: OrganizeModalOptions) {
		super(app);
		this.opts = opts;
		for (const row of opts.rows) {
			this.checked.set(row.id, row.selected);
			const fallback = row.options?.find((o) => !o.disabled)?.value;
			this.choice.set(row.id, row.optionValue ?? fallback ?? "");
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: this.opts.title });
		if (this.opts.intro) {
			contentEl.createEl("p", {
				cls: "bookmarker-domain-notice",
				text: this.opts.intro,
			});
		}

		const controls = contentEl.createDiv({ cls: "bookmarker-organize-controls" });
		controls
			.createEl("button", { text: "Select all" })
			.addEventListener("click", () => this.setAll(true));
		controls
			.createEl("button", { text: "Select none" })
			.addEventListener("click", () => this.setAll(false));

		const list = contentEl.createDiv({ cls: "bookmarker-organize-list" });
		for (const row of this.opts.rows) this.renderRow(list, row);

		new Setting(contentEl)
			.addButton((button) => {
				this.applyButton = button.buttonEl;
				button.setCta().onClick(() => void this.apply());
			})
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()));

		this.updateApplyLabel();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderRow(list: HTMLElement, row: OrganizeRow): void {
		const rowEl = list.createDiv({ cls: "bookmarker-organize-row" });
		if (row.destructive) rowEl.addClass("bookmarker-organize-row-destructive");

		const checkbox = rowEl.createEl("input", { attr: { type: "checkbox" } });
		checkbox.checked = this.checked.get(row.id) ?? false;
		checkbox.addEventListener("change", () => {
			this.checked.set(row.id, checkbox.checked);
			this.updateApplyLabel();
		});

		const body = rowEl.createDiv({ cls: "bookmarker-organize-body" });
		body.createDiv({ cls: "bookmarker-organize-label", text: row.label });
		if (row.detail) {
			body.createDiv({ cls: "bookmarker-organize-detail", text: row.detail });
		}

		if (row.options && row.options.length) {
			const select = body.createEl("select", { cls: "bookmarker-organize-select" });
			for (const opt of row.options) {
				const optionEl = select.createEl("option", {
					value: opt.value,
					text: opt.label,
				});
				if (opt.disabled) optionEl.disabled = true;
			}
			select.value = this.choice.get(row.id) ?? "";
			select.addEventListener("change", () => {
				this.choice.set(row.id, select.value);
			});
		}
	}

	private setAll(value: boolean): void {
		for (const key of this.checked.keys()) this.checked.set(key, value);
		const boxes = this.contentEl.querySelectorAll<HTMLInputElement>(
			".bookmarker-organize-row input[type=checkbox]",
		);
		boxes.forEach((box) => (box.checked = value));
		this.updateApplyLabel();
	}

	private selectedCount(): number {
		let n = 0;
		for (const value of this.checked.values()) if (value) n++;
		return n;
	}

	private updateApplyLabel(): void {
		if (!this.applyButton) return;
		const label = this.opts.applyLabel ?? "Apply";
		const count = this.selectedCount();
		this.applyButton.setText(`${label} (${count})`);
		this.applyButton.toggleAttribute("disabled", count === 0);
	}

	private async apply(): Promise<void> {
		const selected: OrganizeSelection[] = [];
		for (const row of this.opts.rows) {
			if (!this.checked.get(row.id)) continue;
			selected.push({ id: row.id, optionValue: this.choice.get(row.id) || undefined });
		}
		this.close();
		await this.opts.onApply(selected);
	}
}
