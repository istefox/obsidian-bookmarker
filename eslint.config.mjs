import obsidianmd from "eslint-plugin-obsidianmd";
import tsParser from "@typescript-eslint/parser";

export default [
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// Disabled: every report is a false positive here. The rule would
			// lowercase proper nouns (Wayback Machine, Pocket, Raindrop, Netscape),
			// URL/protocol examples (obsidian://, https://example.com), and key
			// prefixes (sk-ant-). Applying its fixes degrades user-facing text.
			"obsidianmd/ui/sentence-case": "off",
		},
	},
	{
		// Test files are dev-only: esbuild's entry point is src/main.ts, so
		// *.test.ts is never reachable from the bundle and the mobile/no-Node-deps
		// constraint (CLAUDE.md "Gotchas") does not apply to them.
		files: ["src/**/*.test.ts"],
		rules: {
			"import/no-nodejs-modules": "off",
		},
	},
];
