export interface ImportItem {
	url: string;
	title: string;
	tags: string[];
	folder?: string;
	created?: string;
}

/** Parse a Netscape HTML or CSV export into bookmark items. */
export function parseImport(filename: string, content: string): ImportItem[] {
	return /\.csv$/i.test(filename)
		? parseCsv(content)
		: parseNetscapeHtml(content);
}

/** Pocket / Raindrop / browser HTML export: <A HREF TAGS ADD_DATE>Title</A>. */
function parseNetscapeHtml(html: string): ImportItem[] {
	const doc = new DOMParser().parseFromString(html, "text/html");
	const items: ImportItem[] = [];
	for (const anchor of Array.from(doc.querySelectorAll("a[href]"))) {
		const url = anchor.getAttribute("href") ?? "";
		if (!/^https?:\/\//i.test(url)) continue;
		items.push({
			url,
			title: (anchor.textContent ?? "").trim() || url,
			tags: splitTags(anchor.getAttribute("tags")),
			created: isoFromEpoch(anchor.getAttribute("add_date")),
		});
	}
	return items;
}

/** Raindrop CSV export (header row with url/title/tags/folder/created). */
function parseCsv(text: string): ImportItem[] {
	const rows = parseCsvRows(text);
	if (rows.length < 2) return [];
	const header = rows[0].map((h) => h.trim().toLowerCase());
	const col = (name: string) => header.indexOf(name);
	const urlI = col("url");
	const titleI = col("title");
	const tagsI = col("tags");
	const folderI = col("folder");
	const createdI = col("created");
	if (urlI < 0) return [];

	const items: ImportItem[] = [];
	for (let r = 1; r < rows.length; r++) {
		const row = rows[r];
		const url = (row[urlI] ?? "").trim();
		if (!/^https?:\/\//i.test(url)) continue;
		const folder = folderI >= 0 ? (row[folderI] ?? "").trim() : "";
		const created = createdI >= 0 ? (row[createdI] ?? "").trim() : "";
		items.push({
			url,
			title: (titleI >= 0 ? (row[titleI] ?? "").trim() : "") || url,
			tags: tagsI >= 0 ? splitTags(row[tagsI]) : [],
			folder: folder || undefined,
			created: created || undefined,
		});
	}
	return items;
}

function splitTags(value: string | null): string[] {
	return (value ?? "")
		.split(",")
		.map((t) => t.trim().replace(/^#/, ""))
		.filter(Boolean);
}

/** Netscape ADD_DATE is epoch seconds. */
function isoFromEpoch(value: string | null): string | undefined {
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0) return undefined;
	return new Date(n * 1000).toISOString();
}

/** Minimal RFC-4180-ish CSV parser handling quoted fields and escaped quotes. */
function parseCsvRows(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else if (c !== "\r") {
				field += c;
			}
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n") {
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else if (c !== "\r") {
			field += c;
		}
	}
	if (field.length || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}
