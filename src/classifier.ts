import { Notice, requestUrl } from "obsidian";
import { BookmarkerSettings } from "./settings";
import {
	BookmarkInput,
	Classifier,
	ClassificationResult,
	Taxonomy,
} from "./types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 256;
// Anthropic only caches blocks above a model-dependent minimum; guard with a
// conservative character threshold so we never send an uncacheable cache_control.
const MIN_CACHEABLE_CHARS = 2048;

/**
 * Run the active classifier with graceful degradation: Claude when configured,
 * falling back to the heuristic on any error, and to an empty proposal if even
 * that throws. The result is always post-processed against the taxonomy and
 * settings (tag/folder intersection, maxTags clamp).
 */
export async function classifyBookmark(
	settings: BookmarkerSettings,
	input: BookmarkInput,
	taxonomy: Taxonomy,
): Promise<ClassificationResult> {
	if (settings.classifierMode === "claude" && settings.anthropicApiKey) {
		try {
			const raw = await new ClaudeClassifier(settings).classifyRaw(input, taxonomy);
			return postProcess(raw, taxonomy, settings);
		} catch {
			// Surface the degradation so a misconfigured key isn't silently ignored.
			new Notice("Bookmarker: Claude classifier failed, using the offline heuristic.");
		}
	}
	try {
		const raw = new HeuristicClassifier().classifyRaw(input, taxonomy, settings.maxTags);
		return postProcess(raw, taxonomy, settings);
	} catch {
		return emptyResult();
	}
}

/** Live check that the configured key and model can reach the Anthropic API. */
export async function testClaudeConnection(
	settings: BookmarkerSettings,
): Promise<{ ok: boolean; detail: string }> {
	if (!settings.anthropicApiKey) {
		return { ok: false, detail: "no API key set" };
	}
	try {
		const response = await requestUrl({
			url: ANTHROPIC_URL,
			method: "POST",
			throw: false,
			headers: {
				"x-api-key": settings.anthropicApiKey,
				"anthropic-version": ANTHROPIC_VERSION,
				"content-type": "application/json",
				"anthropic-dangerous-direct-browser-access": "true",
			},
			body: JSON.stringify({
				model: settings.model,
				max_tokens: 1,
				messages: [{ role: "user", content: "ping" }],
			}),
		});
		if (response.status >= 200 && response.status < 300) {
			return { ok: true, detail: `model ${settings.model}` };
		}
		const apiMsg = extractErrorMessage(response.json);
		return { ok: false, detail: `HTTP ${response.status}${apiMsg ? `: ${apiMsg}` : ""}` };
	} catch (error) {
		return { ok: false, detail: error instanceof Error ? error.message : String(error) };
	}
}

function extractErrorMessage(json: unknown): string {
	if (json && typeof json === "object" && "error" in json) {
		const err = (json as { error?: { message?: unknown } }).error;
		if (err && typeof err.message === "string") return err.message;
	}
	return "";
}

/** Shape returned by the engines before post-processing. */
interface RawProposal {
	tags: string[];
	folder: string;
	confidence: number;
}

export class ClaudeClassifier implements Classifier {
	constructor(private readonly settings: BookmarkerSettings) {}

	async classify(input: BookmarkInput, taxonomy: Taxonomy): Promise<ClassificationResult> {
		return postProcess(await this.classifyRaw(input, taxonomy), taxonomy, this.settings);
	}

	async classifyRaw(input: BookmarkInput, taxonomy: Taxonomy): Promise<RawProposal> {
		const system = buildSystemPrompt(
			taxonomy,
			this.settings.maxTags,
			this.settings.allowNewTags,
			this.settings.allowNewFolders,
		);
		const user =
			`URL: ${input.url}\n` +
			`Title: ${input.title}\n` +
			`Description: ${input.description}\n` +
			`Excerpt: ${input.excerpt}`;

		const response = await requestUrl({
			url: ANTHROPIC_URL,
			method: "POST",
			throw: false,
			headers: {
				"x-api-key": this.settings.anthropicApiKey,
				"anthropic-version": ANTHROPIC_VERSION,
				"content-type": "application/json",
				// Defensive against 403/CORS-style rejections (brief §6a).
				"anthropic-dangerous-direct-browser-access": "true",
			},
			body: JSON.stringify({
				model: this.settings.model,
				max_tokens: MAX_TOKENS,
				system:
					system.length >= MIN_CACHEABLE_CHARS
						? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
						: system,
				messages: [{ role: "user", content: user }],
			}),
		});

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`classifier API error (HTTP ${response.status})`);
		}

		const text = extractText(response.json);
		return parseProposal(text);
	}
}

export class HeuristicClassifier implements Classifier {
	async classify(input: BookmarkInput, taxonomy: Taxonomy): Promise<ClassificationResult> {
		// maxTags is applied in post-processing; pass a generous cap here.
		return postProcess(this.classifyRaw(input, taxonomy, 10), taxonomy, {
			allowNewTags: false,
			allowNewFolders: true,
			maxTags: 10,
		});
	}

	classifyRaw(input: BookmarkInput, taxonomy: Taxonomy, maxTags: number): RawProposal {
		const tokens = tokenize(`${input.title} ${input.description} ${input.excerpt}`);
		const counts = new Map<string, number>();
		for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);

		const tags = rankByOverlap(taxonomy.tags, counts).slice(0, maxTags);
		const folders = rankByOverlap(taxonomy.folders, counts);
		const topFolder = folders[0];

		const total = tokens.length || 1;
		const topFolderToken = topFolder ? tokenize(topFolder)[0] : undefined;
		const confidence = topFolder
			? Math.min(1, (counts.get(topFolderToken ?? "") ?? 0) / total + 0.2)
			: 0;

		return { tags, folder: topFolder ?? "", confidence };
	}
}

// --- shared helpers -------------------------------------------------------

function buildSystemPrompt(
	taxonomy: Taxonomy,
	maxTags: number,
	allowNewTags: boolean,
	allowNewFolders: boolean,
): string {
	const tagList = taxonomy.tags.join(", ") || "(none yet)";
	const folderList = taxonomy.folders.join(", ") || "(none yet)";

	const tagRule = allowNewTags
		? "Reuse an existing tag only when it is genuinely about the same topic. If none truly fits, propose a precise NEW tag instead of stretching a loosely related one."
		: "Use ONLY tags from the existing list. If none is genuinely relevant, return an empty tags array. Never force a weakly related tag.";
	const folderRule = allowNewFolders
		? "Choose an existing folder ONLY when the page is genuinely about that folder's topic. A loose thematic link (e.g. both mention AI) is not enough. When no existing folder is a clear topical match, propose a concise NEW folder named for the page's actual subject (set isNewFolder true)."
		: "Choose an existing folder ONLY when the page is genuinely about that folder's topic. A loose thematic link is not enough. When none clearly matches, leave folder empty (it goes to the root).";

	return [
		"You are a bookmark classifier for an Obsidian vault. Given a web page's metadata,",
		`propose (1) up to ${maxTags} topic tags and (2) the single best destination folder.`,
		"Guidelines:",
		"- Tags describe the page's TOPIC or SUBJECT MATTER, never the action of buying or",
		'  visiting. For an online store page, tag the kind of product (e.g. "ebooks",',
		'  "kindle", "libri"), not "shopping", "spesa", or "groceries".',
		"- The excerpt may include site navigation, menus, and category labels. Judge the",
		"  topic from the title, description, and main content, not from stray menu words.",
		"- The existing tags/folders are a vocabulary to reuse ONLY when relevant. Never",
		"  pick one just because it is the only option available; an irrelevant tag or",
		"  folder is worse than a precise new one.",
		`- ${tagRule}`,
		`- ${folderRule}`,
		"- Write any new tag or folder name in the same language as the page content.",
		"- Output STRICT minified JSON, no prose, no markdown fences:",
		'  {"tags":[...],"folder":"...","isNewFolder":bool,"newTags":[...],"confidence":0..1}',
		"Example. Page about an online Kindle ebook store, existing tags: spesa.",
		'Correct: {"tags":["ebook","kindle","libri"],"folder":"Libri","isNewFolder":true,',
		'"newTags":["ebook","kindle","libri"],"confidence":0.8}. Wrong: using "spesa" — the',
		"page is about ebooks, not groceries.",
		"Example. Page about an Obsidian plugin, existing folders: formazione, API keys.",
		'Correct: a new folder like "Obsidian" or "Plugins" (isNewFolder true). Wrong:',
		'reusing "formazione" just because the plugin mentions AI; that is a loose link.',
		`Existing tags: ${tagList}`,
		`Existing folders (relative to root): ${folderList}`,
	].join("\n");
}

/** Pull the assistant text out of an Anthropic messages response. */
function extractText(json: unknown): string {
	if (
		json &&
		typeof json === "object" &&
		"content" in json &&
		Array.isArray((json as { content: unknown[] }).content)
	) {
		const blocks = (json as { content: Array<{ type?: string; text?: string }> }).content;
		const textBlock = blocks.find((b) => b.type === "text" && typeof b.text === "string");
		if (textBlock?.text) return textBlock.text;
	}
	throw new Error("classifier returned an unexpected response shape");
}

/** Defensive JSON parse: strip accidental fences/prose around the object. */
function parseProposal(text: string): RawProposal {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start === -1 || end === -1 || end < start) {
		throw new Error("classifier did not return JSON");
	}
	const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
	return {
		tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
		folder: typeof parsed.folder === "string" ? parsed.folder : "",
		confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
	};
}

function postProcess(
	raw: RawProposal,
	taxonomy: Taxonomy,
	settings: Pick<BookmarkerSettings, "allowNewTags" | "allowNewFolders" | "maxTags">,
): ClassificationResult {
	const existingTags = new Set(taxonomy.tags.map((t) => t.toLowerCase()));
	let tags = dedupe(raw.tags.map((t) => t.replace(/^#/, "").trim()).filter(Boolean));
	if (!settings.allowNewTags) {
		tags = tags.filter((t) => existingTags.has(t.toLowerCase()));
	}
	tags = tags.slice(0, settings.maxTags);

	let folder = raw.folder.trim().replace(/^\/+|\/+$/g, "");
	const folderExists = taxonomy.folders.some((f) => f.toLowerCase() === folder.toLowerCase());
	let isNewFolder = folder !== "" && !folderExists;
	if (isNewFolder && !settings.allowNewFolders) {
		folder = ""; // fall back to root
		isNewFolder = false;
	}

	const newTags = tags.filter((t) => !existingTags.has(t.toLowerCase()));
	const confidence = clamp(raw.confidence, 0, 1);
	return { tags, folder, isNewFolder, newTags, confidence };
}

function emptyResult(): ClassificationResult {
	return { tags: [], folder: "", isNewFolder: false, newTags: [], confidence: 0 };
}

const STOPWORDS = new Set([
	"the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
	"is", "are", "was", "were", "be", "as", "at", "by", "from", "that", "this",
	"it", "its", "you", "your", "we", "our", "they", "their", "how", "what",
	"why", "when", "which", "who", "will", "can", "about", "into", "over",
]);

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Score each candidate name by how many of its word-parts appear in the page tokens. */
function rankByOverlap(candidates: string[], counts: Map<string, number>): string[] {
	const scored = candidates
		.map((name) => {
			const parts = tokenize(name);
			const score = parts.reduce((sum, p) => sum + (counts.get(p) ?? 0), 0);
			return { name, score };
		})
		.filter((c) => c.score > 0)
		.sort((a, b) => b.score - a.score);
	return scored.map((c) => c.name);
}

function dedupe(values: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const v of values) {
		const key = v.toLowerCase();
		if (!seen.has(key)) {
			seen.add(key);
			out.push(v);
		}
	}
	return out;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
