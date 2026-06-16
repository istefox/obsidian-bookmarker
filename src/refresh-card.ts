import { App, Notice, normalizePath, TFile } from "obsidian";
import type BookmarkerPlugin from "./main";
import { fetchHtml, parseMetadata } from "./metadata";
import { fetchScreenshot, proxiedImage } from "./image";
import { isSafeRemoteUrl } from "./url-safety";
import { probeUrl } from "./link-check";
import { classifyBookmark } from "./classifier";
import { readTaxonomy } from "./taxonomy";
import { ReviewModal } from "./review-modal";
import { ensureFolder, sanitizeFileName, sanitizeFolderPath } from "./note-writer";
import { BookmarkDraft } from "./types";

/**
 * Re-run the capture pipeline on an existing bookmark: check whether the URL is
 * broken, re-fetch its metadata and cover, re-classify tags and folder, then open
 * the review window pre-filled with the fresh proposal. Applying updates the note's
 * frontmatter, cover, and folder while leaving the body (e.g. ## Notes) untouched.
 */
export async function refreshBookmarkCard(plugin: BookmarkerPlugin, file: TFile): Promise<void> {
	const { app, settings } = plugin;
	const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
	const url = typeof fm.url === "string" ? fm.url : "";
	if (!url) {
		new Notice("Bookmarker: this note has no URL.");
		return;
	}

	const notice = new Notice("Refreshing…", 0);
	try {
		const probe = await probeUrl(url);
		if (probe === "broken") {
			await flagBroken(app, file, true);
			new Notice("Bookmarker: URL is broken (404/410) — flagged, not refreshed.");
			return;
		}
		if (probe === "unreachable") {
			// Ambiguous (could be your connection); leave the flag as-is.
			new Notice("Bookmarker: couldn't reach the page — try again later.");
			return;
		}

		let html: string;
		try {
			html = await fetchHtml(url);
		} catch {
			// The probe said alive, so don't flag broken on a one-off fetch failure.
			new Notice("Bookmarker: couldn't fetch the page — try again later.");
			return;
		}

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
			name: file.basename,
			title: asString(fm.title) || metadata.title,
			description: metadata.description || asString(fm.description),
			tags: classification.tags,
			folder: classification.folder || relativeFolder(file, settings.rootFolder),
			imageUrl: candidates[0] ?? null,
			faviconUrl: metadata.faviconUrl,
			domain: metadata.domain,
			type: metadata.type || asString(fm.type) || "link",
			favorite: fm.favorite === true,
			created: asString(fm.created) || undefined,
		};

		new ReviewModal(
			app,
			{
				draft,
				taxonomy,
				confidence: classification.confidence,
				allowNewFolders: settings.allowNewFolders,
				imageCandidates: candidates,
			},
			(result) => {
				if (result) void applyRefresh(plugin, file, result);
			},
		).open();
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		new Notice(`Refresh failed: ${msg}`);
	} finally {
		notice.hide();
	}
}

/** Apply the reviewed draft to the existing note: frontmatter + cover, then move/rename. */
async function applyRefresh(
	plugin: BookmarkerPlugin,
	file: TFile,
	draft: BookmarkDraft,
): Promise<void> {
	const { app, settings } = plugin;
	try {
		await app.fileManager.processFrontMatter(file, (f: Record<string, unknown>) => {
			f.title = draft.title;
			f.description = draft.description;
			f.type = draft.type;
			f.favorite = draft.favorite;
			f.tags = draft.tags;
			f.broken = false;
			const safeImage =
				draft.imageUrl && isSafeRemoteUrl(draft.imageUrl) ? draft.imageUrl : "";
			f.image = safeImage ? proxiedImage(safeImage, settings.useImageProxy) : "";
			if (draft.faviconUrl && isSafeRemoteUrl(draft.faviconUrl)) f.favicon = draft.faviconUrl;
		});

		const root = normalizePath(settings.rootFolder);
		const rel = sanitizeFolderPath(draft.folder);
		const targetDir = rel ? normalizePath(`${root}/${rel}`) : root;
		await ensureFolder(app, targetDir);

		const base = sanitizeFileName(draft.name || draft.title);
		let name = base;
		let n = 1;
		while (true) {
			const candidate = normalizePath(`${targetDir}/${name}.md`);
			if (candidate === file.path || !app.vault.getAbstractFileByPath(candidate)) break;
			name = `${base} ${n++}`;
		}
		const newPath = normalizePath(`${targetDir}/${name}.md`);
		if (newPath !== file.path) await app.fileManager.renameFile(file, newPath);

		new Notice("Bookmarker: card refreshed.");
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		new Notice(`Refresh failed: ${msg}`);
	}
}

async function flagBroken(app: App, file: TFile, broken: boolean): Promise<void> {
	try {
		await app.fileManager.processFrontMatter(file, (f: Record<string, unknown>) => {
			f.broken = broken;
		});
	} catch (error) {
		console.warn(`[bookmarker] could not flag ${file.path}:`, error);
	}
}

function relativeFolder(file: TFile, rootFolder: string): string {
	const root = normalizePath(rootFolder);
	const prefix = `${root}/`;
	const parent = file.parent?.path ?? "";
	return parent.startsWith(prefix) ? parent.slice(prefix.length) : "";
}

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}
