import {useRef, useEffect, useCallback} from 'react'
import {posthog} from './usePostHog'

/**
 * Hook for tracking audio stream playback metrics.
 * Tracks play, pause, errors, and page close events with duration.
 */
export function useStreamTracking() {
	const playbackStartTime = useRef(null)

	// Calculate playback duration in seconds
	const getPlaybackDuration = useCallback(() => {
		if (!playbackStartTime.current) return 0
		return Math.round((Date.now() - playbackStartTime.current) / 1000)
	}, [])

	// End the current playback session and send analytics
	const endPlaybackSession = useCallback(
		(reason) => {
			if (!playbackStartTime.current) return

			const duration = getPlaybackDuration()
			posthog.capture('stream_end', {
				reason,
				duration_seconds: duration,
			})

			playbackStartTime.current = null
		},
		[getPlaybackDuration]
	)

	// Start a new playback session
	const startPlaybackSession = useCallback(() => {
		playbackStartTime.current = Date.now()
		posthog.capture('stream_play')
	}, [])

	// Track an error event
	const trackError = useCallback(
		(error) => {
			posthog.capture('stream_error', {
				error_code: error?.code,
				error_message: error?.message || 'Unknown error',
				duration_seconds: getPlaybackDuration(),
			})
			endPlaybackSession('error')
		},
		[getPlaybackDuration, endPlaybackSession]
	)

	// Handle page close/navigation
	useEffect(() => {
		const handlePageHide = () => {
			if (playbackStartTime.current) {
				endPlaybackSession('page_close')
			}
		}

		// pagehide is more reliable than beforeunload on mobile
		window.addEventListener('pagehide', handlePageHide)
		window.addEventListener('beforeunload', handlePageHide)

		return () => {
			window.removeEventListener('pagehide', handlePageHide)
			window.removeEventListener('beforeunload', handlePageHide)
		}
	}, [endPlaybackSession])

	return {
		startPlaybackSession,
		endPlaybackSession,
		trackError,
		getPlaybackDuration,
		isPlaying: () => playbackStartTime.current !== null,
	}
}
