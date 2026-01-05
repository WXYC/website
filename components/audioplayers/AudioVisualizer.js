import React, {useEffect, useRef, useState, useCallback} from 'react'

/**
 * Audio visualizer using audioMotion-analyzer.
 * Shows random bars on initial load, real audio data when playing,
 * and freezes bars when paused. Falls back to animated simulation if CORS blocks audio data.
 */

// Symbols to store audio nodes on audio element (survives HMR)
// Increment version to force recreation of analyzer
const ANALYZER_VERSION = 5
const ANALYZER_KEY = '__audioMotionAnalyzer'
const AUDIO_NODES_KEY = '__audioNodes'
const VERSION_KEY = '__audioMotionVersion'

// Shared analyzer configuration
const ANALYZER_CONFIG = {
	mode: 7,
	barSpace: 4,
	fixedBarWidth: 8,
	roundBars: true,
	bgAlpha: 0,
	channelLayout: 'single',
	gradient: 'classic',
	ledBars: false,
	lumiBars: false,
	maxFreq: 16000,
	minFreq: 30,
	overlay: true,
	radial: false,
	reflexAlpha: 0,
	reflexRatio: 0,
	showBgColor: false,
	showPeaks: false,
	showScaleX: false,
	showScaleY: false,
	smoothing: 0.7,
	weightingFilter: 'D',
}

// Generate random bar values for initial display
const generateRandomBarValues = (count) => {
	return Array.from({length: count}, () => 0.2 + Math.random() * 0.6)
}

// Generate animated wave values for CORS fallback
const generateAnimatedValues = (count, phase) => {
	return Array.from({length: count}, (_, i) => {
		const wave1 = Math.sin(phase + i * 0.3) * 0.2
		const wave2 = Math.sin(phase * 1.3 + i * 0.5) * 0.15
		const wave3 = Math.sin(phase * 0.7 + i * 0.2) * 0.1
		return Math.max(0.15, 0.35 + wave1 + wave2 + wave3)
	})
}

const AudioVisualizer = ({audioRef, isPlaying}) => {
	const containerRef = useRef(null)
	const analyzerRef = useRef(null)
	const [isReady, setIsReady] = useState(false)
	const hasEverPlayed = useRef(false)
	const hasReceivedAudioData = useRef(false)
	const usingFallbackAnimation = useRef(false)
	const initialValuesRef = useRef(null)
	const animationPhaseRef = useRef(0)
	const animationIntervalRef = useRef(null)

	// Initialize audioMotion-analyzer
	useEffect(() => {
		if (!containerRef.current || !audioRef?.current) return

		const audioElement = audioRef.current

		const initAnalyzer = async () => {
			// Check if already connected with current version (survives HMR)
			if (
				audioElement[ANALYZER_KEY] &&
				audioElement[VERSION_KEY] === ANALYZER_VERSION
			) {
				console.log('[Visualizer] Reusing existing analyzer')
				const analyzer = audioElement[ANALYZER_KEY]
				analyzer.setOptions(ANALYZER_CONFIG)
				analyzer.gradient = 'white-bars'
				analyzerRef.current = analyzer
				setIsReady(true)
				
				// If we haven't played yet, set custom data for initial display
				if (!hasEverPlayed.current) {
					const barCount = analyzer.getBars().length
					if (!initialValuesRef.current || initialValuesRef.current.length !== barCount) {
						initialValuesRef.current = generateRandomBarValues(barCount)
					}
					analyzer.setCustomData(initialValuesRef.current)
				}
				return
			}

			// Old version detected - destroy and recreate
			if (audioElement[ANALYZER_KEY]) {
				console.log('[Visualizer] Old version detected, recreating')
				try {
					audioElement[ANALYZER_KEY].destroy()
				} catch (e) {
					// Ignore cleanup errors
				}
				delete audioElement[ANALYZER_KEY]
			}

			console.log('[Visualizer] Creating new analyzer...')

			try {
				const {default: AudioMotionAnalyzer} = await import(
					'../../lib/audioMotion-analyzer.js'
				)

				// Create audio context and mono mixer
				let audioNodes = audioElement[AUDIO_NODES_KEY]

				if (!audioNodes) {
					const audioContext = new (window.AudioContext ||
						window.webkitAudioContext)()

					const source = audioContext.createMediaElementSource(audioElement)

					// Create mono mixer
					const monoMixer = audioContext.createGain()
					monoMixer.channelCount = 1
					monoMixer.channelCountMode = 'explicit'
					monoMixer.channelInterpretation = 'speakers'
					monoMixer.gain.value = 1.0

					source.connect(monoMixer)
					source.connect(audioContext.destination)

					audioNodes = {audioContext, source, monoMixer}
					audioElement[AUDIO_NODES_KEY] = audioNodes
				}

				// Create analyzer
				const analyzer = new AudioMotionAnalyzer(containerRef.current, {
					audioCtx: audioNodes.audioContext,
					...ANALYZER_CONFIG,
				})

				// Connect mono-mixed signal
				analyzer.connectInput(audioNodes.monoMixer)

				// Custom white gradient
				analyzer.registerGradient('white-bars', {
					colorStops: ['#ffffff', '#ffffff'],
				})
				analyzer.gradient = 'white-bars'

				// Store on audio element
				audioElement[ANALYZER_KEY] = analyzer
				audioElement[VERSION_KEY] = ANALYZER_VERSION
				analyzerRef.current = analyzer
				setIsReady(true)

				// Set random initial values
				const barCount = analyzer.getBars().length
				initialValuesRef.current = generateRandomBarValues(barCount)
				analyzer.setCustomData(initialValuesRef.current)

				console.log('[Visualizer] Ready with', barCount, 'bars')
			} catch (error) {
				console.error('[Visualizer] Failed to initialize:', error)
			}
		}

		initAnalyzer()
	}, [audioRef])

	// Start fallback animation (for CORS blocked audio)
	const startFallbackAnimation = useCallback(() => {
		if (animationIntervalRef.current) return // Already running
		
		const analyzer = analyzerRef.current
		if (!analyzer) return

		const barCount = analyzer.getBars().length
		usingFallbackAnimation.current = true
		console.log('[Visualizer] Starting fallback animation')

		animationIntervalRef.current = setInterval(() => {
			animationPhaseRef.current += 0.15
			const values = generateAnimatedValues(barCount, animationPhaseRef.current)
			analyzer.setCustomData(values)
		}, 50) // ~20fps for smooth animation
	}, [])

	// Stop fallback animation
	const stopFallbackAnimation = useCallback(() => {
		if (animationIntervalRef.current) {
			clearInterval(animationIntervalRef.current)
			animationIntervalRef.current = null
		}
	}, [])

	// Handle play/pause state changes
	useEffect(() => {
		if (!analyzerRef.current || !isReady) return

		const analyzer = analyzerRef.current

		if (isPlaying) {
			// First play - switch from custom data to real audio
			if (!hasEverPlayed.current) {
				hasEverPlayed.current = true
				analyzer.clearCustomData()
				console.log('[Visualizer] First play - using real audio data')
			}
			// If using fallback, restart animation
			if (usingFallbackAnimation.current) {
				startFallbackAnimation()
			}
			// Resume analyzer
			analyzer.toggleAnalyzer(true)
		} else {
			// Pause - freeze the display and stop animation
			if (hasEverPlayed.current) {
				stopFallbackAnimation()
				analyzer.toggleAnalyzer(false)
				console.log('[Visualizer] Paused - frozen')
			}
		}
	}, [isPlaying, isReady, startFallbackAnimation, stopFallbackAnimation])

	// Check for audio data availability (CORS detection)
	useEffect(() => {
		if (!isPlaying || !isReady || !analyzerRef.current) return
		if (hasReceivedAudioData.current || usingFallbackAnimation.current) return

		const audioElement = audioRef?.current
		if (!audioElement) return

		let checkCount = 0
		let checkInterval = null

		const startChecking = () => {
			console.log('[Visualizer] Checking for audio data...')
			checkCount = 0

			checkInterval = setInterval(() => {
				try {
					const energy = analyzerRef.current.getEnergy()
					
					if (energy > 0) {
						console.log('[Visualizer] Receiving audio data')
						hasReceivedAudioData.current = true
						clearInterval(checkInterval)
					} else {
						checkCount++
						// After 3 seconds (30 checks at 100ms), fall back to animation
						if (checkCount >= 30) {
							console.log('[Visualizer] No audio data (CORS?) - using fallback animation')
							clearInterval(checkInterval)
							startFallbackAnimation()
						}
					}
				} catch (err) {
					console.error('[Visualizer] Error checking energy:', err)
					clearInterval(checkInterval)
					startFallbackAnimation()
				}
			}, 100)
		}

		// Wait for audio to actually be playing before checking
		if (!audioElement.paused && audioElement.readyState >= 3) {
			startChecking()
		} else {
			audioElement.addEventListener('playing', startChecking, {once: true})
		}

		return () => {
			if (checkInterval) clearInterval(checkInterval)
			audioElement.removeEventListener('playing', startChecking)
		}
	}, [isPlaying, isReady, audioRef, startFallbackAnimation])

	// Cleanup animation on unmount
	useEffect(() => {
		return () => stopFallbackAnimation()
	}, [stopFallbackAnimation])

	return (
		<div
			ref={containerRef}
			className="h-full w-full"
			style={{background: 'transparent'}}
		/>
	)
}

export default AudioVisualizer
