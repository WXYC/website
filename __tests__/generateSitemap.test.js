import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = process.cwd()
const SCRIPT = path.join(ROOT, 'scripts', 'generate-sitemap.py')
const BASE = 'https://example.test'

let build

/** Write a file (and its parent directories) inside the fake build. */
function page(relpath, body = '<html></html>') {
	const full = path.join(build, relpath)
	fs.mkdirSync(path.dirname(full), {recursive: true})
	fs.writeFileSync(full, body)
}

function run(args = []) {
	return execFileSync(
		'python3',
		[SCRIPT, '--root', build, '--base-url', BASE, ...args],
		{encoding: 'utf8'}
	)
}

function locs() {
	const xml = fs.readFileSync(path.join(build, 'sitemap.xml'), 'utf8')
	return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
}

beforeEach(() => {
	build = fs.mkdtempSync(path.join(os.tmpdir(), 'wxyc-sitemap-'))
})

afterEach(() => {
	fs.rmSync(build, {recursive: true, force: true})
})

/**
 * /sitemap.xml was 404ing (~94 requests/week). The generator enumerates what
 * the build actually produced rather than a hand-kept list, so the interesting
 * behaviour is entirely in what it maps and what it refuses to include.
 */
describe('generate-sitemap.py', () => {
	it('maps built files to the URLs the Worker serves them at', () => {
		page('index.html')
		page('privacy.html')
		page(path.join('blog', 'index.html'))
		page(path.join('blog', 'a-post.html'))
		page(path.join('blog', 'category', 'album-review.html'))

		run()

		expect(locs()).toEqual([
			`${BASE}/`,
			`${BASE}/blog/`,
			`${BASE}/blog/a-post`,
			`${BASE}/blog/category/album-review`,
			`${BASE}/privacy`,
		])
	})

	it('gives a directory index the trailing slash the Worker canonicalises to', () => {
		// Under html_handling: "auto-trailing-slash" the slashed form is
		// canonical and the bare path 307s to it, so emitting the bare path
		// would put a redirect in the sitemap. Verified live: wxyc.org/listen
		// answers 307 -> /listen/. Only the root is slash-free.
		page('index.html')
		page(path.join('deep', 'nested', 'index.html'))

		run()

		expect(locs()).toEqual([`${BASE}/`, `${BASE}/deep/nested/`])
	})

	it('leaves out the /listen meta-refresh shim', () => {
		// public/listen/index.html is a meta refresh whose own rel=canonical
		// points at the site root -- the same duplicate-content case as
		// /fiftieth, redirecting by markup rather than by a _redirects rule.
		page('index.html')
		page(path.join('listen', 'index.html'))

		run()

		expect(locs()).toEqual([`${BASE}/`])
	})

	it('leaves out the error page, the Tina admin SPA and build artifacts', () => {
		page('index.html')
		page('404.html')
		page(path.join('admin', 'index.html'))
		page(path.join('_next', 'whatever.html'))

		run()

		expect(locs()).toEqual([`${BASE}/`])
	})

	it('leaves out the deliberately unlinked standalone documents', () => {
		// public/open-engineering-work.html and for-credit.html exist to be
		// handed to someone directly (see README). Listing them in a sitemap
		// would advertise to every crawler what the pages were built not to be.
		page('index.html')
		page('open-engineering-work.html')
		page('for-credit.html')

		run()

		expect(locs()).toEqual([`${BASE}/`])
	})

	it('leaves out /fiftieth, which is a 301 alias for /50th', () => {
		page('index.html')
		page('50th.html')
		page('fiftieth.html')

		run()

		expect(locs()).toEqual([`${BASE}/`, `${BASE}/50th`])
	})

	it('percent-encodes paths so an awkward slug cannot break the XML', () => {
		page('index.html')
		page(path.join('blog', 'a post & more.html'))

		run()

		expect(locs()).toContain(`${BASE}/blog/a%20post%20%26%20more`)
	})

	it('emits no lastmod, because a CI checkout mtime would be a lie', () => {
		page('index.html')
		run()
		expect(
			fs.readFileSync(path.join(build, 'sitemap.xml'), 'utf8')
		).not.toContain('lastmod')
	})

	it('refuses to write an empty sitemap rather than publishing one', () => {
		page(path.join('admin', 'index.html')) // present, but never indexable
		expect(() => run()).toThrow()
		expect(fs.existsSync(path.join(build, 'sitemap.xml'))).toBe(false)
	})

	it('fails loudly when the build directory is missing', () => {
		fs.rmSync(build, {recursive: true, force: true})
		expect(() => run()).toThrow()
	})
})
