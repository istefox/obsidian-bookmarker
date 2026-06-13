import { Notice, TFile } from "obsidian";
import type BookmarkerPlugin from "./main";
import { fetchHtml, parseMetadata } from "./metadata";
import { writeBookmarkNote } from "./note-writer";

/**
 * M2 capture pipeline: fetch → parse metadata → download image → write note.
 * Classifier (M3), review modal population (M3), and the Microlink/favicon/Wayback
 * fallbacks (M4/M5) are layered on top of this in later milestones.
 */
export async function captureBookmark(
	plugin: BookmarkerPlugin,
	url: string,
): Promise<void> {
	const progress = new Notice(`Bookmarking ${url}…`, 0);
	try {
		const html = await fetchHtml(url);
		const metadata = parseMetadata(html, url, plugin.settings.excerptLength);
		const notePath = await writeBookmarkNote(
			plugin.app,
			plugin.settings,
			url,
			metadata,
		);
		progress.hide();
		new Notice(`Bookmark saved: ${notePath}`);

		const file = plugin.app.vault.getAbstractFileByPath(notePath);
		if (file instanceof TFile) {
			await plugin.app.workspace.getLeaf(false).openFile(file);
		}
	} catch (error) {
		progress.hide();
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Bookmark failed: ${message}`);
	}
}
