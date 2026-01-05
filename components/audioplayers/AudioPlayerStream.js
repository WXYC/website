import React from 'react'
import {FaPlay, FaPause} from 'react-icons/fa'
import AudioVisualizer from './AudioVisualizer'
import {useAudio} from '../../context/AudioContext'

// audio player for radio broadcast aka infinite stream
// Uses shared AudioContext for continuous playback across page navigation
const AudioPlayerStream = () => {
	const {audioRef, isPlaying, isAudioReady, togglePlayPause} = useAudio()

	return (
		<div className="flex h-16 max-w-sm items-center justify-center">
			<div className="flex flex-row items-center">
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
					{isAudioReady && (
						<AudioVisualizer audioRef={audioRef} isPlaying={isPlaying} />
					)}
				</div>
			</div>
		</div>
	)
}

export default AudioPlayerStream
