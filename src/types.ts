/** Page metadata extracted from a fetched HTML document. */
export interface PageMetadata {
	title: string;
	description: string;
	/** Absolute image URL (og:image / twitter:image), or null if none found. */
	imageUrl: string | null;
	/** Absolute favicon URL, or null if the page declares none. */
	faviconUrl: string | null;
	/** Plain-text excerpt of the page body (used by the classifier in M3). */
	excerpt: string;
	domain: string;
}
