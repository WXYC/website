import {describe, it, expect} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Hand-authored, single-file HTML documents served straight out of public/.
// They are not Next.js pages: nothing imports them, no layout wraps them, and
// the nav does not link them. That is deliberate — each is a standalone
// document that someone is handed the URL to.
//
// The whole arrangement rests on one property: the file must be the entire
// page. A Next page gets its CSS and fonts from the build; a file dropped in
// public/ gets nothing, so any <script src>, stylesheet <link> or <img src> it
// carries would resolve against wxyc.org and 404 (relative) or leak to a third
// party (absolute). These tests pin that property rather than the prose,
// because the prose is expected to be replaced wholesale by a fresh export.
const DOCUMENTS = [
	{file: 'open-engineering-work.html', url: '/open-engineering-work'},
	{file: 'for-credit.html', url: '/for-credit'},
]

// Attributes the browser fetches without being asked. `href` is not on the
// list: on <a> it is navigation, not a subresource, and the documents link out
// to GitHub and mailto: freely.
const SUBRESOURCE =
	/<(?:script|img|iframe|source|embed|video|audio)\b[^>]*\bsrc\s*=/gi
const STYLESHEET = /<link\b[^>]*\brel\s*=\s*["']?stylesheet/gi

describe.each(DOCUMENTS)('public/$file (served at $url)', ({file}) => {
	const full = path.join('public', file)

	it('is present in public/, so the export copies it to the origin', () => {
		expect(fs.existsSync(full)).toBe(true)
	})

	it('carries a <title>, which is all the browser tab and any share card get', () => {
		const html = fs.readFileSync(full, 'utf8')
		expect(html).toMatch(/<title>[^<]+<\/title>/i)
	})

	it('fetches no subresources, so it renders with nothing but itself', () => {
		const html = fs.readFileSync(full, 'utf8')
		expect(html.match(SUBRESOURCE) ?? []).toEqual([])
		expect(html.match(STYLESHEET) ?? []).toEqual([])
	})
})
