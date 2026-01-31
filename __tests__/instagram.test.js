import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {
	createMockFetch,
	createTestLifecycle,
	withEnvVars,
	testData,
} from './test-utils'

const lifecycle = createTestLifecycle()

describe('instagram', () => {
	const envHelper = withEnvVars({
		INSTAGRAM_BUSINESS_ACCOUNT_ID: 'test-account-id',
		INSTAGRAM_ACCESS_TOKEN: 'test-access-token',
	})

	beforeEach(() => {
		lifecycle.beforeEach()
		envHelper.setup()
	})

	afterEach(() => {
		lifecycle.afterEach()
		envHelper.teardown()
	})

	describe('formatInstagramPost', () => {
		it('formats IMAGE type post correctly', async () => {
			const {formatInstagramPost} = await import('../lib/instagram')
			const post = testData.instagramPost({
				id: 'img123',
				media_type: 'IMAGE',
				media_url: 'https://example.com/photo.jpg',
				permalink: 'https://instagram.com/p/img123/',
				caption: 'Photo caption',
				timestamp: '2024-01-15T12:00:00Z',
			})

			const result = formatInstagramPost(post)

			expect(result.id).toBe('img123')
			expect(result.type).toBe('image')
			expect(result.imageUrl).toBe('https://example.com/photo.jpg')
			expect(result.videoUrl).toBeNull()
			expect(result.permalink).toBe('https://instagram.com/p/img123/')
			expect(result.caption).toBe('Photo caption')
		})

		it('formats VIDEO type post with thumbnail', async () => {
			const {formatInstagramPost} = await import('../lib/instagram')
			const post = testData.instagramPost({
				id: 'vid456',
				media_type: 'VIDEO',
				media_url: 'https://example.com/video.mp4',
				thumbnail_url: 'https://example.com/thumb.jpg',
				permalink: 'https://instagram.com/p/vid456/',
				caption: 'Video caption',
				timestamp: '2024-01-15T12:00:00Z',
			})

			const result = formatInstagramPost(post)

			expect(result.type).toBe('video')
			expect(result.imageUrl).toBe('https://example.com/thumb.jpg')
			expect(result.videoUrl).toBe('https://example.com/video.mp4')
		})

		it('formats CAROUSEL_ALBUM type correctly', async () => {
			const {formatInstagramPost} = await import('../lib/instagram')
			const post = testData.instagramPost({
				id: 'car789',
				media_type: 'CAROUSEL_ALBUM',
				media_url: 'https://example.com/carousel.jpg',
			})

			const result = formatInstagramPost(post)

			expect(result.type).toBe('carousel_album')
			expect(result.imageUrl).toBe('https://example.com/carousel.jpg')
			expect(result.videoUrl).toBeNull()
		})

		it('handles lowercase media_type', async () => {
			const {formatInstagramPost} = await import('../lib/instagram')
			const post = testData.instagramPost({media_type: 'image'})

			const result = formatInstagramPost(post)

			expect(result.type).toBe('image')
		})

		it('handles empty/missing caption', async () => {
			const {formatInstagramPost} = await import('../lib/instagram')
			const post = testData.instagramPost({caption: undefined})

			const result = formatInstagramPost(post)

			expect(result.caption).toBe('')
		})

		it('converts timestamp to Date object', async () => {
			const {formatInstagramPost} = await import('../lib/instagram')
			const post = testData.instagramPost({timestamp: '2024-01-15T12:00:00Z'})

			const result = formatInstagramPost(post)

			expect(result.date).toBeInstanceOf(Date)
			expect(result.date.toISOString()).toBe('2024-01-15T12:00:00.000Z')
		})
	})

	describe('fetchInstagramPosts', () => {
		it('returns empty array when credentials missing', async () => {
			envHelper.teardown() // Remove credentials
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

			const {fetchInstagramPosts} = await import('../lib/instagram')
			const result = await fetchInstagramPosts()

			expect(result).toEqual([])
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining('Instagram credentials not configured')
			)
			warnSpy.mockRestore()
		})

		it('calls correct API URL with credentials', async () => {
			const mockFetch = createMockFetch({data: []})
			global.fetch = mockFetch

			const {fetchInstagramPosts} = await import('../lib/instagram')
			await fetchInstagramPosts()

			expect(mockFetch).toHaveBeenCalledTimes(1)
			const callUrl = mockFetch.mock.calls[0][0]
			expect(callUrl).toContain('graph.facebook.com')
			expect(callUrl).toContain('test-account-id')
			expect(callUrl).toContain('access_token=test-access-token')
		})

		it('uses default limit of 12', async () => {
			const mockFetch = createMockFetch({data: []})
			global.fetch = mockFetch

			const {fetchInstagramPosts} = await import('../lib/instagram')
			await fetchInstagramPosts()

			const callUrl = mockFetch.mock.calls[0][0]
			expect(callUrl).toContain('limit=12')
		})

		it('uses custom limit when provided', async () => {
			const mockFetch = createMockFetch({data: []})
			global.fetch = mockFetch

			const {fetchInstagramPosts} = await import('../lib/instagram')
			await fetchInstagramPosts({limit: 5})

			const callUrl = mockFetch.mock.calls[0][0]
			expect(callUrl).toContain('limit=5')
		})

		it('returns posts from successful response', async () => {
			const mockPosts = [
				testData.instagramPost({id: 'post1'}),
				testData.instagramPost({id: 'post2'}),
			]
			global.fetch = createMockFetch({data: mockPosts})

			const {fetchInstagramPosts} = await import('../lib/instagram')
			const result = await fetchInstagramPosts()

			expect(result).toHaveLength(2)
			expect(result[0].id).toBe('post1')
			expect(result[1].id).toBe('post2')
		})

		it('returns empty array on API error response', async () => {
			global.fetch = createMockFetch(
				{error: {message: 'Invalid token'}},
				{ok: false, status: 400}
			)
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

			const {fetchInstagramPosts} = await import('../lib/instagram')
			const result = await fetchInstagramPosts()

			expect(result).toEqual([])
			expect(errorSpy).toHaveBeenCalledWith(
				'Instagram API error:',
				expect.any(Object)
			)
			errorSpy.mockRestore()
		})

		it('returns empty array on network error', async () => {
			global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

			const {fetchInstagramPosts} = await import('../lib/instagram')
			const result = await fetchInstagramPosts()

			expect(result).toEqual([])
			expect(errorSpy).toHaveBeenCalledWith(
				'Failed to fetch Instagram posts:',
				expect.any(Error)
			)
			errorSpy.mockRestore()
		})
	})

	describe('getInstagramFeed', () => {
		it('fetches and formats posts', async () => {
			const mockPosts = [
				testData.instagramPost({id: 'feed1', media_type: 'IMAGE'}),
				testData.instagramPost({id: 'feed2', media_type: 'VIDEO'}),
			]
			global.fetch = createMockFetch({data: mockPosts})

			const {getInstagramFeed} = await import('../lib/instagram')
			const result = await getInstagramFeed()

			expect(result).toHaveLength(2)
			expect(result[0].id).toBe('feed1')
			expect(result[0].type).toBe('image')
			expect(result[1].id).toBe('feed2')
			expect(result[1].type).toBe('video')
		})

		it('passes limit through to fetchInstagramPosts', async () => {
			const mockFetch = createMockFetch({data: []})
			global.fetch = mockFetch

			const {getInstagramFeed} = await import('../lib/instagram')
			await getInstagramFeed({limit: 8})

			const callUrl = mockFetch.mock.calls[0][0]
			expect(callUrl).toContain('limit=8')
		})

		it('returns empty array when fetch returns empty', async () => {
			global.fetch = createMockFetch({data: []})

			const {getInstagramFeed} = await import('../lib/instagram')
			const result = await getInstagramFeed()

			expect(result).toEqual([])
		})
	})
})
