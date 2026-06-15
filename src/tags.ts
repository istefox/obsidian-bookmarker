/** Frontmatter tags can be an array or a whitespace/comma string; normalize to a
 * clean list without the leading '#'. Empty/whitespace entries are dropped. */
export function normalizeTags(value: unknown): string[] {
	const parts = Array.isArray(value)
		? value
		: typeof value === "string"
			? value.split(/[\s,]+/)
			: [];
	return parts.map((t) => String(t).replace(/^#/, "").trim()).filter(Boolean);
}

/** Normalize a tag list and append `tag` if not already present (case-insensitive). */
export function addTag(value: unknown, tag: string): string[] {
	const tags = normalizeTags(value);
	if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase())) tags.push(tag);
	return tags;
}
