/**
 * SSRF guard for page-controlled URLs (og:image, favicon).
 *
 * The page we fetch can declare an arbitrary image/favicon URL. Without a guard
 * a malicious page could point it at loopback, private, link-local, or cloud
 * metadata addresses (e.g. http://169.254.169.254/...) and have the user's
 * client fetch them. We reject non-http(s) schemes and private/literal hosts.
 *
 * Limitation: this checks the literal host only. A public hostname that resolves
 * to a private IP (DNS rebinding) is not caught here, because Obsidian's
 * requestUrl does not expose the resolved address. Treat this as defense in
 * depth, not a complete SSRF defense.
 */
/** True if the value is a syntactically valid http(s) URL (scheme check only). */
export function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

export function isSafeRemoteUrl(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return false;
	}
	const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
	return !isPrivateHost(host);
}

/** Private/reserved-range check on the first two IPv4 octets (matches original logic). */
function isPrivateIPv4Prefix(a: number, b: number): boolean {
	if (a === 0 || a === 10 || a === 127) return true;
	if (a === 169 && b === 254) return true; // link-local + cloud metadata
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
	return false;
}

function isPrivateHost(host: string): boolean {
	if (host === "" || host === "localhost" || host.endsWith(".localhost")) {
		return true;
	}
	if (host === "0.0.0.0" || host === "::" || host === "::1") {
		return true;
	}

	const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (v4) {
		return isPrivateIPv4Prefix(Number(v4[1]), Number(v4[2]));
	}

	// Everything below only applies to actual IPv6 literals. The caller already
	// strips brackets before calling isPrivateHost, so a plain DNS hostname (e.g.
	// "fda.gov", "fdic.gov") never contains a colon and must not be matched by the
	// IPv6 prefix checks below (a bare startsWith("fc"/"fd") would misclassify them).
	if (!host.includes(":")) {
		return false;
	}

	// IPv4-mapped IPv6, dotted form (::ffff:a.b.c.d)
	if (host.startsWith("::ffff:") && host.includes(".")) {
		return isPrivateHost(host.slice("::ffff:".length));
	}
	// IPv4-mapped IPv6, compressed hex-group form (::ffff:xxxx:xxxx), which is how
	// the URL parser normalizes e.g. [::ffff:127.0.0.1] to [::ffff:7f00:1]. Each
	// hex group is a 16-bit chunk; together they encode the 4 IPv4 bytes.
	const mappedHex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
	if (mappedHex) {
		const g1 = Number.parseInt(mappedHex[1], 16);
		const a = (g1 >> 8) & 0xff;
		const b = g1 & 0xff;
		return isPrivateIPv4Prefix(a, b);
	}

	// IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
	if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
		return true;
	}
	return false;
}
