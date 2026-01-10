import React, {useState, useRef, useEffect} from 'react'
import {FaPlay, FaPause} from 'react-icons/fa'
import AudioVisualizer from './AudioVisualizer'
import {useStreamTracking} from '../../lib/useStreamTracking'

// audio player for radio broadcast aka infinite stream
const AudioPlayerStream = () => {
	const [isPlaying, setIsPlaying] = useState(false)

	const audioPlayer = useRef() // ref to audio player
	const {startPlaybackSession, endPlaybackSession, trackError} =
		useStreamTracking()

	// Log audio element events to track stream connection timing
	useEffect(() => {
		const audio = audioPlayer.current
		if (!audio) return

		const logEvent = (eventName) => (e) => {
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
		]

		events.forEach((evt) => audio.addEventListener(evt, logEvent(evt)))

		// Handle audio errors
		const handleError = (e) => {
			logEvent('error')(e)
			trackError(audio.error)
			setIsPlaying(false)
		}

		audio.addEventListener('error', handleError)

		return () => {
			events.forEach((evt) => audio.removeEventListener(evt, logEvent(evt)))
			audio.removeEventListener('error', handleError)
		}
	}, [trackError])

	const togglePlayPause = () => {
		const prevValue = isPlaying
		setIsPlaying(!prevValue)
		if (!prevValue) {
			console.log('[AudioStream] Play requested, calling audio.play()')
			startPlaybackSession()
			audioPlayer.current.play()
		} else {
			console.log('[AudioStream] Pause requested')
			endPlaybackSession('pause')
			audioPlayer.current.pause()
		}
	}

	return (
		<div className="flex h-16 max-w-sm items-center justify-center">
			<div className="flex flex-row items-center">
				<audio
					ref={audioPlayer}
					src="https://audio-mp3.ibiblio.org/wxyc.mp3"
					preload="none"
					crossOrigin="anonymous"
				></audio>
				<button
					className="rounded-lg bg-transparent p-2 text-gray-200"
					onClick={togglePlayPause}
				>
					{isPlaying ? (
						<FaPause size={24} />
					) : (
						<FaPlay size={24} className="relative pl-0.5" />
					)}
				</button>

				{/* Real-time audio visualizer */}
				<div className="h-10 w-36 md:w-60 lg:w-48">
					<AudioVisualizer audioRef={audioPlayer} isPlaying={isPlaying} />
				</div>
			</div>
		</div>
	)
}

export default AudioPlayerStream
