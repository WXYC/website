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
 * `/fiftieth` is an alias for `/50th`, and it is served two different ways
 * because the site has two origins with different capabilities: a real 301
 * from `public/_redirects` on the Cloudflare Worker, and a meta refresh from
 * `pages/fiftieth.jsx` on the GitHub Pages deploy, which ignores that file and
 * is still the WXYC/website#262 rollback target. Both are pinned here; losing
 * either one silently drops the alias on one of the two origins.
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

	describe('pages/fiftieth.jsx (GitHub Pages fallback)', () => {
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
