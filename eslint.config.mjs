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
];
