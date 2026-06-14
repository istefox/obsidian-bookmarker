import { Notice, TFile } from "obsidian";
import type BookmarkerPlugin from "./main";
import { fetchHtml, parseMetadata } from "./metadata";
import { sanitizeFileName, writeBookmarkNote } from "./note-writer";
import { fetchScreenshot } from "./image";
import { isSafeRemoteUrl } from "./url-safety";
import { classifyBookmark } from "./classifier";
import { readTaxonomy } from "./taxonomy";
import { ReviewModal } from "./review-modal";
import { countSameDomain, findDuplicate } from "./duplicates";
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

	const duplicate = settings.warnOnDuplicate
		? findDuplicate(app, settings.rootFolder, url)
		: null;
	// Identical URL: never duplicate — open the existing note and stop.
	if (duplicate?.exact) {
		new Notice(`Already bookmarked: ${duplicate.file.basename}`);
		await app.workspace.getLeaf(false).openFile(duplicate.file);
		return;
	}

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

		const candidates = [...metadata.imageCandidates];
		if (candidates.length === 0 && settings.enableScreenshotFallback) {
			const shot = await fetchScreenshot(url);
			if (shot && isSafeRemoteUrl(shot)) candidates.push(shot);
		}

		const draft: BookmarkDraft = {
			url,
			name: sanitizeFileName(metadata.title),
			title: metadata.title,
			description: metadata.description,
			tags: classification.tags,
			folder: classification.folder,
			imageUrl: candidates[0] ?? null,
			faviconUrl: metadata.faviconUrl,
			domain: metadata.domain,
		};

		progress.hide();

		const domainCount = settings.warnOnSameDomain
			? countSameDomain(app, settings.rootFolder, metadata.domain)
			: 0;

		// A normalized-only duplicate forces the review window so the user can decide,
		// even when "Always review" is off.
		const finalDraft =
			settings.alwaysReview || duplicate
				? await reviewDraft(
						plugin,
						draft,
						taxonomy,
						classification.confidence,
						candidates,
						duplicate?.file ?? null,
						domainCount,
					)
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
	imageCandidates: string[],
	duplicate: TFile | null,
	domainCount: number,
): Promise<BookmarkDraft | null> {
	return new Promise((resolve) => {
		new ReviewModal(
			plugin.app,
			{
				draft,
				taxonomy,
				confidence,
				allowNewFolders: plugin.settings.allowNewFolders,
				imageCandidates,
				duplicatePath: duplicate?.path,
				domain: draft.domain,
				domainCount,
				onOpenDomain: () => void plugin.openBoard(draft.domain),
			},
			resolve,
		).open();
	});
}
