import {describe, it, expect} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Cloudflare Workers static assets rejects any file over 25MiB, and
// `wrangler deploy` fails the whole deploy rather than skipping the file.
// Every served file must stay under the cap or be excluded in .assetsignore.
const LIMIT_BYTES = 25 * 1024 * 1024

// Walks public/ by default (PR-time run via `npm test`); the deploy job runs
// it against the built asset tree with ASSET_GUARD_ROOT=out.
const root = process.env.ASSET_GUARD_ROOT || 'public'

function ignorePatterns(dir) {
	const file = path.join(dir, '.assetsignore')
	if (!fs.existsSync(file)) return []
	return fs
		.readFileSync(file, 'utf8')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith('#'))
}

// gitignore-style subset, sufficient for this file's entries: a pattern with
// a slash matches the exact path relative to the root; one without a slash
// matches a basename at any depth.
function isIgnored(relPath, patterns) {
	return patterns.some((pattern) =>
		pattern.includes('/')
			? relPath === pattern
			: path.posix.basename(relPath) === pattern
	)
}

function walkFiles(dir, base = dir) {
	return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) return walkFiles(full, base)
		if (!entry.isFile()) return []
		return [path.relative(base, full).split(path.sep).join('/')]
	})
}

describe(`asset size guard (${root}/)`, () => {
	it('has an asset tree to check', () => {
		expect(fs.existsSync(root)).toBe(true)
	})

	it.runIf(root !== 'public')(
		'.assetsignore survived into the built asset tree',
		() => {
			expect(fs.existsSync(path.join(root, '.assetsignore'))).toBe(true)
		}
	)

	it('every file is under the Workers 25MiB cap or excluded in .assetsignore', () => {
		const patterns = ignorePatterns(root)
		const offenders = walkFiles(root).filter((relPath) => {
			if (isIgnored(relPath, patterns)) return false
			return fs.statSync(path.join(root, relPath)).size > LIMIT_BYTES
		})
		expect(offenders).toEqual([])
	})
})
