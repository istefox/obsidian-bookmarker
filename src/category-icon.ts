import { setIcon } from "obsidian";

/** Render a category icon: a Lucide name produces an SVG, anything else (emoji) falls back to text. */
export function renderCategoryIcon(el: HTMLElement, value: string): void {
	el.empty();
	setIcon(el, value);
	if (!el.querySelector("svg")) el.setText(value);
}
