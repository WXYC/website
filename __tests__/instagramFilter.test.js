import {describe, it, expect} from 'vitest'
import {
	extractInstagramPostId,
	getSuppressedInstagramIds,
	filterInstagramPosts,
} from '../lib/instagramFilter'
import {testData} from './test-utils'

describe('instagramFilter', () => {
	describe('extractInstagramPostId', () => {
		it('extracts ID from standard /p/ URL', () => {
			expect(
				extractInstagramPostId('https://www.instagram.com/p/ABC123/')
			).toBe('ABC123')
		})

		it('extracts ID from /reel/ URL', () => {
			expect(
				extractInstagramPostId('https://www.instagram.com/reel/XYZ789/')
			).toBe('XYZ789')
		})

		it('handles URL without www', () => {
			expect(extractInstagramPostId('https://instagram.com/p/DEF456/')).toBe(
				'DEF456'
			)
		})

		it('handles URL without trailing slash', () => {
			expect(extractInstagramPostId('https://www.instagram.com/p/GHI789')).toBe(
				'GHI789'
			)
		})

		it('returns null for null input', () => {
			expect(extractInstagramPostId(null)).toBeNull()
		})

		it('returns null for empty string', () => {
			expect(extractInstagramPostId('')).toBeNull()
		})

		it('returns null for undefined input', () => {
			expect(extractInstagramPostId(undefined)).toBeNull()
		})

		it('returns null for non-Instagram URL', () => {
			expect(
				extractInstagramPostId('https://twitter.com/user/status/123')
			).toBeNull()
		})

		it('handles IDs with underscores and hyphens', () => {
			expect(
				extractInstagramPostId('https://www.instagram.com/p/ABC_123-xyz/')
			).toBe('ABC_123-xyz')
		})

		it('handles mixed case in ID', () => {
			expect(
				extractInstagramPostId('https://www.instagram.com/p/AbCdEfGhIj/')
			).toBe('AbCdEfGhIj')
		})
	})

	describe('getSuppressedInstagramIds', () => {
		it('returns empty set for empty array', () => {
			const result = getSuppressedInstagramIds([])
			expect(result.size).toBe(0)
		})

		it('returns empty set when no posts have instagramUrl', () => {
			const blogPosts = [
				testData.blogPostEdge({node: {instagramUrl: null}}),
				testData.blogPostEdge({node: {instagramUrl: undefined}}),
			]
			const result = getSuppressedInstagramIds(blogPosts)
			expect(result.size).toBe(0)
		})

		it('extracts single ID correctly', () => {
			const blogPosts = [
				testData.blogPostEdge({
					node: {instagramUrl: 'https://www.instagram.com/p/ABC123/'},
				}),
			]
			const result = getSuppressedInstagramIds(blogPosts)
			expect(result.has('ABC123')).toBe(true)
			expect(result.size).toBe(1)
		})

		it('extracts multiple IDs', () => {
			const blogPosts = [
				testData.blogPostEdge({
					node: {instagramUrl: 'https://www.instagram.com/p/AAA111/'},
				}),
				testData.blogPostEdge({
					node: {instagramUrl: 'https://www.instagram.com/p/BBB222/'},
				}),
				testData.blogPostEdge({
					node: {instagramUrl: 'https://www.instagram.com/reel/CCC333/'},
				}),
			]
			const result = getSuppressedInstagramIds(blogPosts)
			expect(result.has('AAA111')).toBe(true)
			expect(result.has('BBB222')).toBe(true)
			expect(result.has('CCC333')).toBe(true)
			expect(result.size).toBe(3)
		})

		it('handles null node gracefully', () => {
			const blogPosts = [{node: null}, testData.blogPostEdge()]
			const result = getSuppressedInstagramIds(blogPosts)
			expect(result.size).toBe(0)
		})

		it('deduplicates IDs from multiple posts with same URL', () => {
			const blogPosts = [
				testData.blogPostEdge({
					node: {instagramUrl: 'https://www.instagram.com/p/SAME123/'},
				}),
				testData.blogPostEdge({
					node: {instagramUrl: 'https://www.instagram.com/p/SAME123/'},
				}),
			]
			const result = getSuppressedInstagramIds(blogPosts)
			expect(result.size).toBe(1)
			expect(result.has('SAME123')).toBe(true)
		})
	})

	describe('filterInstagramPosts', () => {
		it('returns all posts when no matches', () => {
			const instagramPosts = [
				testData.instagramPost({id: 'IG001'}),
				testData.instagramPost({id: 'IG002'}),
			]
			const blogPosts = [
				testData.blogPostEdge({
					node: {instagramUrl: 'https://www.instagram.com/p/DIFFERENT/'},
				}),
			]
			const result = filterInstagramPosts(instagramPosts, blogPosts)
			expect(result).toHaveLength(2)
		})

		it('filters out matching posts', () => {
			const instagramPosts = [
				testData.instagramPost({id: 'IG001'}),
				testData.instagramPost({id: 'IG002'}),
				testData.instagramPost({id: 'IG003'}),
			]
			const blogPosts = [
				testData.blogPostEdge({
					node: {instagramUrl: 'https://www.instagram.com/p/IG002/'},
				}),
			]
			const result = filterInstagramPosts(instagramPosts, blogPosts)
			expect(result).toHaveLength(2)
			expect(result.map((p) => p.id)).toEqual(['IG001', 'IG003'])
		})

		it('filters all posts when all have matches', () => {
			const instagramPosts = [
				testData.instagramPost({id: 'IG001'}),
				testData.instagramPost({id: 'IG002'}),
			]
			const blogPosts = [
				testData.blogPostEdge({
					node: {instagramUrl: 'https://www.instagram.com/p/IG001/'},
				}),
				testData.blogPostEdge({
					node: {instagramUrl: 'https://www.instagram.com/p/IG002/'},
				}),
			]
			const result = filterInstagramPosts(instagramPosts, blogPosts)
			expect(result).toHaveLength(0)
		})

		it('handles empty instagram posts array', () => {
			const blogPosts = [
				testData.blogPostEdge({
					node: {instagramUrl: 'https://www.instagram.com/p/ABC123/'},
				}),
			]
			const result = filterInstagramPosts([], blogPosts)
			expect(result).toHaveLength(0)
		})

		it('handles empty blog posts array', () => {
			const instagramPosts = [
				testData.instagramPost({id: 'IG001'}),
				testData.instagramPost({id: 'IG002'}),
			]
			const result = filterInstagramPosts(instagramPosts, [])
			expect(result).toHaveLength(2)
		})

		it('handles both arrays empty', () => {
			const result = filterInstagramPosts([], [])
			expect(result).toHaveLength(0)
		})
	})
})
