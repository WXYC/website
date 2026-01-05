import React, { createContext, useContext, useRef, useState, useEffect } from 'react'

const AudioContext = createContext(null)

export function AudioProvider({ children }) {
	const audioRef = useRef(null)
	const [isPlaying, setIsPlaying] = useState(false)
	const [isAudioReady, setIsAudioReady] = useState(false)

	// Create a single audio element that persists across navigation
	useEffect(() => {
		if (typeof window === 'undefined') return

		// Create audio element only once
		if (!audioRef.current) {
			const audio = new Audio()
			audio.src = 'https://audio-mp3.ibiblio.org/wxyc.mp3'
			audio.preload = 'none'
			audio.crossOrigin = 'anonymous'
			audioRef.current = audio

			// Log audio element events to track stream connection timing
			const logEvent = (eventName) => () => {
				console.log(`[AudioStream] ${eventName}`, {
					currentTime: audio.currentTime,
					readyState: audio.readyState,
					networkState: audio.networkState,
					paused: audio.paused,
				})
			}

			const events = [
				'loadstart',
				'loadedmetadata',
				'loadeddata',
				'canplay',
				'canplaythrough',
				'playing',
				'waiting',
				'stalled',
				'suspend',
				'error',
			]

			events.forEach((evt) => audio.addEventListener(evt, logEvent(evt)))

			// Sync play state with actual audio state
			audio.addEventListener('play', () => setIsPlaying(true))
			audio.addEventListener('pause', () => setIsPlaying(false))

			setIsAudioReady(true)
		}

		return () => {
			// Don't clean up the audio element - we want it to persist
		}
	}, [])

	const togglePlayPause = () => {
		const audio = audioRef.current
		if (!audio) return

		if (isPlaying) {
			console.log('[AudioStream] Pause requested')
			audio.pause()
		} else {
			console.log('[AudioStream] Play requested, calling audio.play()')
			audio.play()
		}
	}

	const value = {
		audioRef,
		isPlaying,
		isAudioReady,
		togglePlayPause,
	}

	return (
		<AudioContext.Provider value={value}>
			{children}
		</AudioContext.Provider>
	)
}

export function useAudio() {
	const context = useContext(AudioContext)
	if (!context) {
		throw new Error('useAudio must be used within an AudioProvider')
	}
	return context
}

