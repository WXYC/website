import {vi} from 'vitest'
import {cleanup} from '@testing-library/react'

/**
 * Standard lifecycle hooks matching existing test patterns.
 *
 * @param {Object} options
 * @param {boolean} options.useFakeTimers - Whether to use fake timers
 * @returns {Object} beforeEach and afterEach functions
 */
export function createTestLifecycle(options = {}) {
	const {useFakeTimers = false} = options
	return {
		beforeEach: () => {
			vi.clearAllMocks()
			if (useFakeTimers) vi.useFakeTimers()
		},
		afterEach: () => {
			cleanup()
			if (useFakeTimers) vi.useRealTimers()
			vi.resetModules()
		},
	}
}

/**
 * Creates a mock fetch function for API tests.
 *
 * @param {*} responseData - Data to return from json()
 * @param {Object} options
 * @param {boolean} options.ok - Response ok status
 * @param {number} options.status - HTTP status code
 * @returns {Function} Mock fetch function
 */
export function createMockFetch(responseData, options = {}) {
	const {ok = true, status = 200} = options
	return vi.fn().mockResolvedValue({
		ok,
		status,
		json: vi.fn().mockResolvedValue(responseData),
	})
}

/**
 * Environment variable management for tests.
 *
 * @param {Object} envVars - Environment variables to set
 * @returns {Object} setup and teardown functions
 */
export function withEnvVars(envVars) {
	const originalEnv = {...process.env}
	return {
		setup: () => Object.assign(process.env, envVars),
		teardown: () => {
			Object.keys(envVars).forEach((key) => {
				if (originalEnv[key] === undefined) delete process.env[key]
				else process.env[key] = originalEnv[key]
			})
		},
	}
}

/**
 * Test data factories for common objects.
 */
export const testData = {
	/**
	 * Creates a mock Instagram post.
	 */
	instagramPost: (overrides = {}) => ({
		id: 'test-post-123',
		media_type: 'IMAGE',
		media_url: 'https://example.com/image.jpg',
		permalink: 'https://instagram.com/p/test-post-123/',
		caption: 'Test caption',
		timestamp: '2024-01-15T12:00:00Z',
		...overrides,
	}),

	/**
	 * Creates a mock blog post edge (TinaCMS format).
	 */
	blogPostEdge: (overrides = {}) => ({
		node: {
			title: 'Test Post',
			instagramUrl: null,
			...overrides.node,
		},
	}),

	/**
	 * Creates a show row as `GET /flowsheet/range` returns it.
	 *
	 * Defaults to a Monday-morning show in the week of 2026-08-03, which is the
	 * week the playlist-archive tests are written around.
	 */
	flowsheetShow: (overrides = {}) => ({
		id: 1,
		dj_name: 'DJ Biscuit',
		show_name: null,
		specialty_id: null,
		start_time: '2026-08-03T14:00:00.000Z', // 10 AM ET Monday
		end_time: '2026-08-03T17:00:00.000Z',
		...overrides,
	}),

	/**
	 * Creates a played-track entry row as `GET /flowsheet/range` returns it.
	 */
	flowsheetTrack: (overrides = {}) => ({
		id: 100,
		show_id: 1,
		play_order: 1,
		add_time: '2026-08-03T14:05:00.000Z',
		entry_type: 'track',
		artist_name: 'Juana Molina',
		track_title: 'la paradoja',
		album_title: 'DOGA',
		record_label: 'Sonamos',
		request_flag: false,
		...overrides,
	}),

	/**
	 * Creates a `GET /flowsheet?page=&limit=` response envelope, as the live
	 * playlist page (`pages/playlist.jsx`) consumes it. Distinct from the range
	 * envelope above: this endpoint returns one flat `entries` array (already
	 * newest-first) plus pagination metadata and the currently on-air DJ,
	 * rather than a separate `shows` array.
	 *
	 * `total` and `totalPages` default to representative production magnitudes
	 * (2,634,069 rows / 52,682 pages at `limit=50`, verified against the live
	 * endpoint 2026-08-08) rather than to `entries.length`. `total` is the
	 * flowsheet's grand total, not the size of the page being returned, and a
	 * default that quietly equated the two would hide a caller bug in any test
	 * that actually reads pagination metadata. Override both explicitly when a
	 * test cares about them.
	 */
	flowsheetEnvelope: (entries = [], overrides = {}) => ({
		entries,
		total: 2634069,
		page: 0,
		limit: 50,
		totalPages: 52682,
		on_air: null,
		...overrides,
	}),
}
