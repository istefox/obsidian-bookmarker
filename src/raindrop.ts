import { requestUrl } from "obsidian";
import { ImportItem } from "./import";

const API = "https://api.raindrop.io/rest/v1";
const PER_PAGE = 50;
// Safety cap so a malformed response can't loop forever (50k bookmarks).
const MAX_PAGES = 1000;

function auth(token: string): Record<string, string> {
	return { Authorization: `Bearer ${token}` };
}

/** Quick check that the token is valid (GET /user). */
export async function testRaindropToken(
	token: string,
): Promise<{ ok: boolean; detail: string }> {
	if (!token) return { ok: false, detail: "no token set" };
	try {
		const res = await requestUrl({ url: `${API}/user`, headers: auth(token), throw: false });
		if (res.status >= 200 && res.status < 300) {
			const name = isObject(res.json) && isObject(res.json.user) ? str(res.json.user.fullName) : "";
			return { ok: true, detail: name ? `user ${name}` : "token valid" };
		}
		if (res.status === 401) return { ok: false, detail: "HTTP 401: invalid token" };
		return { ok: false, detail: `HTTP ${res.status}` };
	} catch (error) {
		return { ok: false, detail: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * Fetch every raindrop (across all collections, except Trash) and map it to an
 * import item, including the cover image and the parent collection as a folder.
 */
export async function fetchRaindropItems(
	token: string,
	onProgress: (count: number) => void,
): Promise<ImportItem[]> {
	const folders = await fetchCollectionMap(token);
	const items: ImportItem[] = [];
	for (let page = 0; page < MAX_PAGES; page++) {
		const res = await requestUrl({
			url: `${API}/raindrops/0?perpage=${PER_PAGE}&page=${page}`,
			headers: auth(token),
			throw: false,
		});
		if (res.status < 200 || res.status >= 300) {
			throw new Error(`Raindrop API error (HTTP ${res.status})`);
		}
		const batch = isObject(res.json) && Array.isArray(res.json.items) ? res.json.items : [];
		for (const raw of batch) {
			const mapped = mapRaindrop(raw, folders);
			if (mapped) items.push(mapped);
		}
		onProgress(items.length);
		if (batch.length < PER_PAGE) break;
	}
	return items;
}

/** Map every collection id to its title, for folders (root + nested). */
async function fetchCollectionMap(token: string): Promise<Map<number, string>> {
	const map = new Map<number, string>();
	for (const path of ["/collections", "/collections/childrens"]) {
		const res = await requestUrl({ url: `${API}${path}`, headers: auth(token), throw: false });
		if (res.status < 200 || res.status >= 300) continue;
		const list = isObject(res.json) && Array.isArray(res.json.items) ? res.json.items : [];
		for (const raw of list) {
			if (!isObject(raw)) continue;
			const id = num(raw._id);
			const title = str(raw.title);
			if (id !== undefined && title) map.set(id, title);
		}
	}
	return map;
}

function mapRaindrop(raw: unknown, folders: Map<number, string>): ImportItem | null {
	if (!isObject(raw)) return null;
	const url = str(raw.link);
	if (!/^https?:\/\//i.test(url)) return null;
	const collectionId = isObject(raw.collection) ? num(raw.collection["$id"]) : undefined;
	const cover = str(raw.cover);
	return {
		url,
		title: str(raw.title) || url,
		tags: Array.isArray(raw.tags) ? raw.tags.map(String).map((t) => t.trim()).filter(Boolean) : [],
		folder: collectionId !== undefined ? folders.get(collectionId) : undefined,
		created: str(raw.created) || undefined,
		cover: /^https?:\/\//i.test(cover) ? cover : undefined,
		description: str(raw.excerpt) || undefined,
		favorite: raw.important === true || undefined,
		type: str(raw.type) || undefined,
	};
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function str(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function num(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}
