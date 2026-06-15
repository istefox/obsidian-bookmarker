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
			// The sentence-case rule lowercases proper nouns (Wayback Machine,
			// Pocket, Raindrop, Netscape), URLs, protocol schemes (obsidian://),
			// and key prefixes (sk-ant-). Keep it as a warning, not an error.
			"obsidianmd/ui/sentence-case": "warn",
		},
	},
];
