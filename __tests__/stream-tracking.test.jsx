import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {renderHook, act, cleanup} from '@testing-library/react'

// Mock posthog
const mockCapture = vi.fn()

vi.mock('../lib/usePostHog', () => ({
	posthog: {
		capture: (...args) => mockCapture(...args),
	},
}))

describe('useStreamTracking', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.useFakeTimers()
	})

	afterEach(() => {
		cleanup()
		vi.useRealTimers()
		vi.resetModules()
	})

	it('captures stream_play event when playback starts', async () => {
		const {useStreamTracking} = await import('../lib/useStreamTracking')
		const {result} = renderHook(() => useStreamTracking())

		act(() => {
			result.current.startPlaybackSession()
		})

		expect(mockCapture).toHaveBeenCalledWith('stream_play')
	})

	it('captures stream_end with pause reason when paused', async () => {
		const {useStreamTracking} = await import('../lib/useStreamTracking')
		const {result} = renderHook(() => useStreamTracking())

		act(() => {
			result.current.startPlaybackSession()
		})
		mockCapture.mockClear()

		// Advance time by 30 seconds
		act(() => {
			vi.advanceTimersByTime(30000)
		})

		act(() => {
			result.current.endPlaybackSession('pause')
		})

		expect(mockCapture).toHaveBeenCalledWith('stream_end', {
			reason: 'pause',
			duration_seconds: 30,
		})
	})

	it('does not capture stream_end when not playing', async () => {
		const {useStreamTracking} = await import('../lib/useStreamTracking')
		const {result} = renderHook(() => useStreamTracking())

		// Don't start playing, just try to end
		act(() => {
			result.current.endPlaybackSession('pause')
		})

		expect(mockCapture).not.toHaveBeenCalledWith('stream_end', expect.anything())
	})

	it('tracks duration correctly over time', async () => {
		const {useStreamTracking} = await import('../lib/useStreamTracking')
		const {result} = renderHook(() => useStreamTracking())

		act(() => {
			result.current.startPlaybackSession()
		})
		mockCapture.mockClear()

		// Advance time by 2 minutes
		act(() => {
			vi.advanceTimersByTime(120000)
		})

		act(() => {
			result.current.endPlaybackSession('pause')
		})

		expect(mockCapture).toHaveBeenCalledWith('stream_end', {
			reason: 'pause',
			duration_seconds: 120,
		})
	})

	it('captures stream_error with error details', async () => {
		const {useStreamTracking} = await import('../lib/useStreamTracking')
		const {result} = renderHook(() => useStreamTracking())

		act(() => {
			result.current.startPlaybackSession()
		})

		// Advance time by 15 seconds
		act(() => {
			vi.advanceTimersByTime(15000)
		})

		mockCapture.mockClear()

		act(() => {
			result.current.trackError({code: 4, message: 'MEDIA_ERR_SRC_NOT_SUPPORTED'})
		})

		expect(mockCapture).toHaveBeenCalledWith('stream_error', {
			error_code: 4,
			error_message: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
			duration_seconds: 15,
		})

		expect(mockCapture).toHaveBeenCalledWith('stream_end', {
			reason: 'error',
			duration_seconds: 15,
		})
	})

	it('captures stream_end with page_close reason on pagehide', async () => {
		const {useStreamTracking} = await import('../lib/useStreamTracking')
		const {result} = renderHook(() => useStreamTracking())

		act(() => {
			result.current.startPlaybackSession()
		})

		// Advance time by 45 seconds
		act(() => {
			vi.advanceTimersByTime(45000)
		})

		mockCapture.mockClear()

		// Simulate page hide
		act(() => {
			window.dispatchEvent(new Event('pagehide'))
		})

		expect(mockCapture).toHaveBeenCalledWith('stream_end', {
			reason: 'page_close',
			duration_seconds: 45,
		})
	})

	it('reports isPlaying correctly', async () => {
		const {useStreamTracking} = await import('../lib/useStreamTracking')
		const {result} = renderHook(() => useStreamTracking())

		expect(result.current.isPlaying()).toBe(false)

		act(() => {
			result.current.startPlaybackSession()
		})

		expect(result.current.isPlaying()).toBe(true)

		act(() => {
			result.current.endPlaybackSession('pause')
		})

		expect(result.current.isPlaying()).toBe(false)
	})
})
