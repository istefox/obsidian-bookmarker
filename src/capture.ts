import { Notice, TFile } from "obsidian";
import type BookmarkerPlugin from "./main";
import { fetchHtml, parseMetadata } from "./metadata";
import { writeBookmarkNote } from "./note-writer";
import { classifyBookmark } from "./classifier";
import { readTaxonomy } from "./taxonomy";
import { ReviewModal } from "./review-modal";
import { BookmarkDraft, Taxonomy } from "./types";

/**
 * Capture pipeline: fetch → parse metadata → read taxonomy → classify (tags +
 * folder) → optional review modal → write the note. The Microlink/favicon/Wayback
 * fallbacks (M4/M5) layer on top of this later.
 */
export async function captureBookmark(
	plugin: BookmarkerPlugin,
	url: string,
): Promise<void> {
	const { app, settings } = plugin;
	const progress = new Notice(`Bookmarking ${url}…`, 0);
	try {
		const html = await fetchHtml(url);
		const metadata = parseMetadata(html, url, settings.excerptLength);
		const taxonomy = readTaxonomy(app, settings.rootFolder);
		const classification = await classifyBookmark(
			settings,
			{
				url,
				domain: metadata.domain,
				title: metadata.title,
				description: metadata.description,
				excerpt: metadata.excerpt,
			},
			taxonomy,
		);

		const draft: BookmarkDraft = {
			url,
			title: metadata.title,
			description: metadata.description,
			tags: classification.tags,
			folder: classification.folder,
			imageUrl: metadata.imageUrl,
			faviconUrl: metadata.faviconUrl,
			domain: metadata.domain,
		};

		progress.hide();

		const finalDraft = settings.alwaysReview
			? await reviewDraft(plugin, draft, taxonomy, classification.confidence)
			: draft;
		if (!finalDraft) return; // cancelled in the review modal

		const notePath = await writeBookmarkNote(app, settings, finalDraft);
		new Notice(`Bookmark saved: ${notePath}`);

		const file = app.vault.getAbstractFileByPath(notePath);
		if (file instanceof TFile) {
			await app.workspace.getLeaf(false).openFile(file);
		}
	} catch (error) {
		progress.hide();
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Bookmark failed: ${message}`);
	}
}

function reviewDraft(
	plugin: BookmarkerPlugin,
	draft: BookmarkDraft,
	taxonomy: Taxonomy,
	confidence: number,
): Promise<BookmarkDraft | null> {
	return new Promise((resolve) => {
		new ReviewModal(
			plugin.app,
			{
				draft,
				taxonomy,
				confidence,
				allowNewFolders: plugin.settings.allowNewFolders,
			},
			resolve,
		).open();
	});
}
