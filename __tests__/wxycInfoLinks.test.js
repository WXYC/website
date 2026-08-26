/**
 * Turndown guard for the wxyc.info -> wxyc.org link cutover (WXYC/website#214).
 *
 * tubafrenzy — which serves every `wxyc.info/playlists/*` page — goes dark at the
 * 2026-08-31 cutover (WXYC/wiki#93). After that date any surviving link into
 * wxyc.info is a dead link for a listener, so the repo must not carry one.
 *
 * Deliberately a source-level check rather than a render test: `Header.js` and
 * `DropdownMenu.js` hold JSX in `.js` files, which this repo's vitest transform
 * does not accept, and the third link site is TinaCMS-managed `.mdx` content that
 * no component test would ever cover.
 *
 * `searchPlaylists` and `radioWeek` are the two cutover pages left with no
 * successor: `/airplay-search` and `/playlists/archive` were both pulled over
 * the historical-DJ-name exposure (see the commit that removed them), so
 * nothing here links to a replacement for either. That is a deliberate gap,
 * not an oversight in this inventory -- do not "repair" it by pointing a link
 * back at wxyc.info, which the first assertion below forbids and which goes
 * dark at the cutover regardless. `/playlist` is unaffected: it serves only
 * the most recent entries, all written after the write-path fix.
 *
 * Prose mentions of wxyc.info are allowed on purpose. The successor pages each
 * carry a docblock naming the page they replace, and README.md does the same;
 * that is accurate provenance and deleting it to satisfy a grep would lose
 * history. Only *link targets* are policed.
 */
import {describe, it, expect} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SKIP_DIRS = new Set([
	'node_modules',
	'.next',
	'out',
	'.git',
	'.vercel',
	'public',
])
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.md', '.mdx'])

/** JSX/HTML `href="..."` attributes. */
const HREF_PATTERN = /href=["']([^"']+)["']/g
/** Markdown `[text](target)` links. */
const MARKDOWN_LINK_PATTERN = /\]\(([^)\s]+)/g

function sourceFiles(dir = ROOT) {
	return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(full)
		}
		return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [full] : []
	})
}

/** Every link target in `content`, paired with its 1-based line number. */
function linkTargets(content) {
	const targets = []
	content.split('\n').forEach((line, index) => {
		for (const pattern of [HREF_PATTERN, MARKDOWN_LINK_PATTERN]) {
			pattern.lastIndex = 0
			let match
			while ((match = pattern.exec(line)) !== null) {
				targets.push({target: match[1], line: index + 1})
			}
		}
	})
	return targets
}

/** The `pages/` file a route resolves to, or null when the route has no page. */
function resolvePage(route) {
	const base = path.join(ROOT, 'pages', route.replace(/^\//, ''))
	const candidates = [
		...['.js', '.jsx', '.ts', '.tsx'].map((ext) => `${base}${ext}`),
		...['.js', '.jsx', '.ts', '.tsx'].map((ext) =>
			path.join(base, `index${ext}`)
		),
	]
	return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

describe('wxyc.info link cutover', () => {
	it('leaves no link pointing into wxyc.info', () => {
		const violations = sourceFiles().flatMap((file) =>
			linkTargets(fs.readFileSync(file, 'utf8'))
				.filter(({target}) => /wxyc\.info/i.test(target))
				.map(
					({target, line}) =>
						`${path.relative(ROOT, file)}:${line} -> ${target}`
				)
		)
		expect(violations).toEqual([])
	})

	// The link sites inventoried on WXYC/website#214, each with the
	// wxyc.info page it replaces.
	it.each([
		['components/Header.js', '/playlist', 'wxyc.info/playlists/recent'],
		['components/DropdownMenu.js', '/playlist', 'wxyc.info/playlists/recent'],
	])('%s links to %s in place of %s', (file, route) => {
		const targets = linkTargets(
			fs.readFileSync(path.join(ROOT, file), 'utf8')
		).map(({target}) => target)
		expect(targets).toContain(route)
	})

	it.each([['/playlist']])('%s resolves to a page that exists', (route) => {
		expect(resolvePage(route)).not.toBeNull()
	})
})
