import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {renderHook, cleanup} from '@testing-library/react'
import {Router} from 'next/router'

// Mock posthog-js
const mockCapture = vi.fn()
const mockInit = vi.fn()
const mockDebug = vi.fn()

vi.mock('posthog-js', () => ({
	default: {
		init: (...args) => mockInit(...args),
		capture: (...args) => mockCapture(...args),
		debug: (...args) => mockDebug(...args),
	},
}))

describe('PostHog tracking', () => {
	let routeChangeHandler = null

	beforeEach(() => {
		vi.clearAllMocks()

		// Capture the route change handler when it's registered
		vi.spyOn(Router.events, 'on').mockImplementation((event, handler) => {
			if (event === 'routeChangeComplete') {
				routeChangeHandler = handler
			}
		})
		vi.spyOn(Router.events, 'off').mockImplementation(() => {})
	})

	afterEach(() => {
		cleanup()
		routeChangeHandler = null
		vi.resetModules()
	})

	describe('initPostHog', () => {
		it('initializes PostHog with correct configuration', async () => {
			const {initPostHog} = await import('../lib/usePostHog')

			initPostHog('test-key', {apiHost: 'https://custom.host.com'})

			expect(mockInit).toHaveBeenCalledTimes(1)
			expect(mockInit).toHaveBeenCalledWith(
				'test-key',
				expect.objectContaining({
					api_host: 'https://custom.host.com',
					person_profiles: 'identified_only',
				})
			)
		})

		it('uses default api_host when not provided', async () => {
			const {initPostHog} = await import('../lib/usePostHog')

			initPostHog('test-key')

			expect(mockInit).toHaveBeenCalledWith(
				'test-key',
				expect.objectContaining({
					api_host: 'https://us.i.posthog.com',
				})
			)
		})

		it('calls debug() in development mode via loaded callback', async () => {
			const originalEnv = process.env.NODE_ENV
			process.env.NODE_ENV = 'development'

			const {initPostHog} = await import('../lib/usePostHog')
			initPostHog('test-key')

			// Get the loaded callback that was passed to init
			const initCall = mockInit.mock.calls[0]
			const options = initCall[1]
			expect(options.loaded).toBeDefined()

			// Call the loaded callback with a mock posthog instance
			const mockPosthogInstance = {debug: mockDebug}
			options.loaded(mockPosthogInstance)

			expect(mockDebug).toHaveBeenCalled()

			process.env.NODE_ENV = originalEnv
		})

		it('does not call debug() in production mode', async () => {
			const originalEnv = process.env.NODE_ENV
			process.env.NODE_ENV = 'production'

			const {initPostHog} = await import('../lib/usePostHog')
			initPostHog('test-key')

			// Get the loaded callback
			const initCall = mockInit.mock.calls[0]
			const options = initCall[1]

			// Call the loaded callback
			const mockPosthogInstance = {debug: mockDebug}
			options.loaded(mockPosthogInstance)

			expect(mockDebug).not.toHaveBeenCalled()

			process.env.NODE_ENV = originalEnv
		})
	})

	describe('usePostHogPageview', () => {
		it('registers routeChangeComplete event listener', async () => {
			const {usePostHogPageview} = await import('../lib/usePostHog')

			renderHook(() => usePostHogPageview())

			expect(Router.events.on).toHaveBeenCalledWith(
				'routeChangeComplete',
				expect.any(Function)
			)
		})

		it('captures $pageview event on route change', async () => {
			const {usePostHogPageview} = await import('../lib/usePostHog')

			renderHook(() => usePostHogPageview())

			// Simulate a route change
			expect(routeChangeHandler).not.toBeNull()
			routeChangeHandler()

			expect(mockCapture).toHaveBeenCalledWith('$pageview')
		})

		it('unregisters event listener on unmount', async () => {
			const {usePostHogPageview} = await import('../lib/usePostHog')

			const {unmount} = renderHook(() => usePostHogPageview())
			unmount()

			expect(Router.events.off).toHaveBeenCalledWith(
				'routeChangeComplete',
				expect.any(Function)
			)
		})
	})
})
