import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, screen} from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import {createTestLifecycle} from './test-utils'

const replace = vi.fn()

vi.mock('next/router', () => ({
	useRouter: () => ({replace}),
}))

vi.mock('next/head', () => ({
	default: ({children}) => <>{children}</>,
}))

const Fiftieth = (await import('../pages/fiftieth')).default

const ROOT = process.cwd()
const lifecycle = createTestLifecycle()

beforeEach(lifecycle.beforeEach)
afterEach(lifecycle.afterEach)

/**
 * `/fiftieth` is an alias for `/50th`, served two ways. The real one is the
 * 301 in `public/_redirects`, which the Cloudflare Worker follows before it
 * serves any asset. The meta refresh in `pages/fiftieth.jsx` was the fallback
 * for the GitHub Pages deploy, which ignored that file — Pages was retired in
 * WXYC/website#262, so it is no longer a second origin to keep parity with.
 *
 * Both are still pinned, because the meta refresh has a job after the
 * retirement: `next dev` ignores `_redirects` too, so without it the alias is
 * broken for anyone running the site locally. Losing the `_redirects` rule
 * breaks the alias in production; losing the page breaks it in development.
 */
describe('/fiftieth alias', () => {
	describe('public/_redirects (Cloudflare origin)', () => {
		const rules = fs
			.readFileSync(path.join(ROOT, 'public', '_redirects'), 'utf8')
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith('#'))
			.map((line) => line.split(/\s+/))

		it('redirects /fiftieth to /50th permanently, with and without the trailing slash', () => {
			for (const from of ['/fiftieth', '/fiftieth/']) {
				expect(rules).toContainEqual([from, '/50th', '301'])
			}
		})

		it('declares no splat rule', () => {
			// Cloudflare follows these before serving any matching asset, so a
			// greedy rule here would shadow the whole site — including the
			// /.well-known/acme-challenge path the zone's certificate renewal
			// goes through.
			for (const [from] of rules) {
				expect(from).not.toContain('*')
			}
		})
	})

	describe('pages/fiftieth.jsx (the `next dev` fallback)', () => {
		it('sends a reader with no JavaScript on to /50th', () => {
			const {container} = render(<Fiftieth />)
			const refresh = container.querySelector('meta[http-equiv="refresh"]')

			expect(refresh?.getAttribute('content')).toBe('0; url=/50th')
		})

		it('replaces the history entry rather than pushing one', () => {
			// A pushed entry would make Back land on this page, which
			// immediately forwards again — the reader cannot leave.
			render(<Fiftieth />)

			expect(replace).toHaveBeenCalledWith('/50th')
		})

		it('keeps itself out of search results and points at the real page', () => {
			const {container} = render(<Fiftieth />)

			expect(
				container.querySelector('meta[name="robots"]')?.getAttribute('content')
			).toBe('noindex')
			expect(
				container.querySelector('link[rel="canonical"]')?.getAttribute('href')
			).toBe('https://wxyc.org/50th')
			expect(screen.getByRole('link').getAttribute('href')).toBe('/50th')
		})
	})
})
