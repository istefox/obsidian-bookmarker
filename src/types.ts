/** Page metadata extracted from a fetched HTML document. */
export interface PageMetadata {
	title: string;
	description: string;
	/** Absolute image URL (first candidate), or null if none found. */
	imageUrl: string | null;
	/** All resolved, SSRF-safe preview-image candidates, in priority order. */
	imageCandidates: string[];
	/** Absolute favicon URL, or null if the page declares none. */
	faviconUrl: string | null;
	/** Plain-text excerpt of the page body (fed to the classifier). */
	excerpt: string;
	domain: string;
	/** Detected content type: article|video|image|document|audio|link. */
	type: string;
}

/** What the classifier sees about a page (brief §6). */
export interface BookmarkInput {
	url: string;
	domain: string;
	title: string;
	description: string;
	excerpt: string;
}

/** The vault's existing taxonomy the classifier should reuse. */
export interface Taxonomy {
	/** Existing vault tags, without the leading '#'. */
	tags: string[];
	/** Existing subfolders relative to the root folder. */
	folders: string[];
}

/** The classifier's proposal for a bookmark. `folder` "" means the root folder. */
export interface ClassificationResult {
	tags: string[];
	folder: string;
	isNewFolder: boolean;
	newTags: string[];
	/** 0..1 */
	confidence: number;
}

/** Swappable classifier engine (brief §6). */
export interface Classifier {
	classify(input: BookmarkInput, taxonomy: Taxonomy): Promise<ClassificationResult>;
}

/** Final, user-confirmed values written to the note. `folder` "" means root. */
export interface BookmarkDraft {
	url: string;
	/** Desired file name (no extension); defaults to a readable form of the title. */
	name: string;
	title: string;
	description: string;
	tags: string[];
	folder: string;
	imageUrl: string | null;
	faviconUrl: string | null;
	domain: string;
	type: string;
	favorite: boolean;
	/** ISO creation date; defaults to now when omitted (set on import). */
	created?: string;
}
