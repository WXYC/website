/**
 * Formats a duration in seconds to MM:SS format.
 *
 * @param {number} secs - Duration in seconds (can be float, will be floored)
 * @returns {string} - Formatted time string like "01:30"
 */
export function calculateTime(secs) {
	const minutes = Math.floor(secs / 60)
	const seconds = Math.floor(secs % 60)
	const returnedMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`
	const returnedSeconds = seconds < 10 ? `0${seconds}` : `${seconds}`
	return `${returnedMinutes}:${returnedSeconds}`
}
