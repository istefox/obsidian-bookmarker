// Minimal test-only stand-in for the real Obsidian runtime.
//
// The "obsidian" npm dependency is a *types-only* package (package.json has
// `"main": ""`): it has no actual runtime implementation for Node to load, since
// the real implementation is injected by the Obsidian app itself when the plugin
// runs there. That means source files can't be imported directly under plain Node
// without something standing in for it.
//
// This stub is loaded in place of "obsidian" only for `npm test` (see the "test"
// script in package.json, which points NODE_PATH at this directory). It exists
// solely so modules that transitively `import ... from "obsidian"` can load and
// run their pure logic; it is not a behavioral reimplementation of the Obsidian
// API and nothing here should be treated as evidence of real Obsidian behavior.
"use strict";

function normalizePath(path) {
	let p = String(path).replace(/\\/g, "/");
	p = p.replace(/\/+/g, "/");
	p = p.replace(/^\/+/, "");
	p = p.replace(/\/+$/, "");
	return p;
}

class TAbstractFile {
	constructor() {
		this.path = "";
	}
}
class TFile extends TAbstractFile {}
class TFolder extends TAbstractFile {
	constructor() {
		super();
		this.children = [];
	}
}
class App {}
class Notice {
	setMessage() {}
	hide() {}
}
class Component {
	addChild() {}
	removeChild() {}
	register() {}
}
class Plugin extends Component {}
class ItemView extends Component {}
class Modal extends Component {
	constructor() {
		super();
		this.contentEl = {};
	}
	open() {}
	close() {}
}
class FuzzySuggestModal extends Modal {}
class Menu extends Component {}
class Setting {
	setName() {
		return this;
	}
	setDesc() {
		return this;
	}
	addText() {
		return this;
	}
	addButton() {
		return this;
	}
	addToggle() {
		return this;
	}
	addDropdown() {
		return this;
	}
}
class PluginSettingTab {}
class TextComponent {}
class ButtonComponent {}
class WorkspaceLeaf {}

function debounce(fn) {
	return fn;
}
async function defaultRequestUrlImpl() {
	throw new Error("requestUrl stub: not implemented for tests");
}
let requestUrlImpl = defaultRequestUrlImpl;
async function requestUrl(...args) {
	return requestUrlImpl(...args);
}
/** Test-only hook: install a mock implementation of requestUrl. */
function __setRequestUrlImpl(fn) {
	requestUrlImpl = fn;
}
/** Test-only hook: restore requestUrl's default (throwing) implementation. */
function __resetRequestUrlImpl() {
	requestUrlImpl = defaultRequestUrlImpl;
}
function setIcon() {}
function stringifyYaml(value) {
	return JSON.stringify(value);
}

module.exports = {
	normalizePath,
	TAbstractFile,
	TFile,
	TFolder,
	App,
	Notice,
	Component,
	Plugin,
	ItemView,
	Modal,
	FuzzySuggestModal,
	Menu,
	Setting,
	PluginSettingTab,
	TextComponent,
	ButtonComponent,
	WorkspaceLeaf,
	debounce,
	requestUrl,
	__setRequestUrlImpl,
	__resetRequestUrlImpl,
	setIcon,
	stringifyYaml,
};
