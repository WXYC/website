import {describe, it, expect} from 'vitest'
import {
	toTitleCase,
	slugToTitle,
	generateBreadcrumbs,
} from '../lib/breadcrumbUtils'

describe('breadcrumbUtils', () => {
	describe('toTitleCase', () => {
		it('capitalizes single word', () => {
			expect(toTitleCase('hello')).toBe('Hello')
		})

		it('capitalizes each word', () => {
			expect(toTitleCase('hello world')).toBe('Hello World')
		})

		it('handles already capitalized words', () => {
			expect(toTitleCase('Hello World')).toBe('Hello World')
		})

		it('handles empty string', () => {
			expect(toTitleCase('')).toBe('')
		})

		it('handles single character words', () => {
			expect(toTitleCase('a b c')).toBe('A B C')
		})
	})

	describe('slugToTitle', () => {
		it('replaces hyphens with spaces', () => {
			expect(slugToTitle('hello-world')).toBe('Hello World')
		})

		it('handles single word slug', () => {
			expect(slugToTitle('archive')).toBe('Archive')
		})

		it('handles multiple hyphens', () => {
			expect(slugToTitle('this-is-a-test')).toBe('This Is A Test')
		})

		it('handles empty string', () => {
			expect(slugToTitle('')).toBe('')
		})
	})

	describe('generateBreadcrumbs', () => {
		it('returns only base breadcrumb for base path', () => {
			const result = generateBreadcrumbs('/blog', {
				baseSegment: 'blog',
				baseHref: '/blog',
				baseText: 'WXYC PRESS',
			})
			expect(result).toEqual([{href: '/blog', text: 'WXYC PRESS'}])
		})

		it('generates breadcrumbs for nested path', () => {
			const result = generateBreadcrumbs('/blog/show-reviews', {
				baseSegment: 'blog',
				baseHref: '/blog',
				baseText: 'WXYC PRESS',
			})
			expect(result).toEqual([
				{href: '/blog', text: 'WXYC PRESS'},
				{href: '/blog/show-reviews', text: 'Show Reviews'},
			])
		})

		it('generates breadcrumbs for deeply nested path', () => {
			const result = generateBreadcrumbs('/blog/show-reviews/my-review', {
				baseSegment: 'blog',
				baseHref: '/blog',
				baseText: 'WXYC PRESS',
			})
			expect(result).toEqual([
				{href: '/blog', text: 'WXYC PRESS'},
				{href: '/blog/show-reviews', text: 'Show Reviews'},
				{href: '/blog/show-reviews/my-review', text: 'My Review'},
			])
		})

		it('applies pluralization at specified index', () => {
			const result = generateBreadcrumbs('/blog/show-review/my-review', {
				baseSegment: 'blog',
				baseHref: '/blog',
				baseText: 'WXYC PRESS',
				pluralizeAtIndex: 1,
			})
			expect(result[2].text).toBe('My Reviews')
		})

		it('does not pluralize when index is null', () => {
			const result = generateBreadcrumbs('/blog/show-review', {
				baseSegment: 'blog',
				baseHref: '/blog',
				baseText: 'WXYC PRESS',
				pluralizeAtIndex: null,
			})
			expect(result[1].text).toBe('Show Review')
		})

		it('builds cumulative hrefs correctly', () => {
			const result = generateBreadcrumbs('/archive/concerts/2024', {
				baseSegment: 'archive',
				baseHref: '/archive',
				baseText: 'Archive',
			})
			expect(result[1].href).toBe('/archive/concerts')
			expect(result[2].href).toBe('/archive/concerts/2024')
		})

		it('filters empty segments', () => {
			const result = generateBreadcrumbs('/blog//show-reviews/', {
				baseSegment: 'blog',
				baseHref: '/blog',
				baseText: 'WXYC PRESS',
			})
			expect(result).toHaveLength(2)
			expect(result[1].text).toBe('Show Reviews')
		})

		it('works without baseSegment stripping', () => {
			const result = generateBreadcrumbs('/about/team', {
				baseHref: '',
				baseText: 'Home',
			})
			expect(result).toEqual([
				{href: '', text: 'Home'},
				{href: '/about', text: 'About'},
				{href: '/about/team', text: 'Team'},
			])
		})

		it('handles archive-style paths', () => {
			const result = generateBreadcrumbs('/archive/concerts', {
				baseSegment: 'archive',
				baseHref: '/archive',
				baseText: 'Archive',
			})
			expect(result).toEqual([
				{href: '/archive', text: 'Archive'},
				{href: '/archive/concerts', text: 'Concerts'},
			])
		})
	})
})
