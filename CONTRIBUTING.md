# Contributing to Bookmarker

Thanks for considering a contribution. This is a small, personal-first plugin, but issues and pull requests are welcome.

## Setup

```bash
npm install
npm run dev     # esbuild watch: rebuilds main.js on save
```

To try your build in Obsidian, copy `main.js`, `manifest.json`, and `styles.css` into `<your vault>/.obsidian/plugins/bookmarker/`, then enable Bookmarker in Community Plugins and reload.

## Before you open a pull request

Run all three. The CI and the reviewer expect them green:

```bash
npm run build    # type-check + production bundle
npm run lint     # eslint-plugin-obsidianmd rules
```

`npm run lint` may print a few `ui/sentence-case` warnings on proper nouns and URLs. Those are known false positives, kept on purpose. New errors are not acceptable.

## Mobile-safe constraints

The plugin ships for desktop and mobile (`isDesktopOnly: false`). Every network and file path has to stay mobile-safe:

- HTTP: use Obsidian's `requestUrl` for all network calls. No `fetch`, Node `http`, `axios`, or `electron`.
- HTML parsing: `new DOMParser()`. No cheerio or jsdom.
- File I/O: the Obsidian vault API only (`vault.create`, `createBinary`, `createFolder`). No Node-only modules (`fs`, `path`, `child_process`, `electron`, `puppeteer`).
- Read the config folder from `vault.configDir`, never a hardcoded `.obsidian`.

## Commits and branches

- Branch off `main`. Name it `type/short-description`.
- Use Conventional Commits in English: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`.
- Keep changes focused. Explain the why in the body when it is not obvious from the diff.

## Releases

Releases are built and signed in CI. Pushing a semver tag (for example `0.1.5`) triggers `.github/workflows/release.yml`, which builds the plugin, attaches `main.js`, `manifest.json`, and `styles.css`, and attaches build provenance. Bump `version` in `manifest.json` and `package.json` and add the entry to `versions.json` before tagging.

## Security and privacy

- Never log the API key or full request bodies.
- The key lives in plaintext in `data.json`. Anything touching it has to keep that in mind.
- New outbound requests should degrade gracefully when the service is down or blocked.
