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

function isPrivateHost(host: string): boolean {
	if (host === "" || host === "localhost" || host.endsWith(".localhost")) {
		return true;
	}
	if (host === "0.0.0.0" || host === "::" || host === "::1") {
		return true;
	}

	const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (v4) {
		const a = Number(v4[1]);
		const b = Number(v4[2]);
		if (a === 0 || a === 10 || a === 127) return true;
		if (a === 169 && b === 254) return true; // link-local + cloud metadata
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
		return false;
	}

	// IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
	if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
		return true;
	}
	// IPv4-mapped IPv6 (::ffff:a.b.c.d)
	if (host.startsWith("::ffff:")) {
		return isPrivateHost(host.slice("::ffff:".length));
	}
	return false;
}
