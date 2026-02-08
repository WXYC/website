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
}
