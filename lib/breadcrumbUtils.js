/**
 * Utilities for generating breadcrumb navigation from URL paths.
 */

/**
 * Capitalizes each word in a string (first letter uppercase, rest lowercase).
 *
 * @param {string} str - String with words separated by spaces
 * @returns {string} - Title-cased string
 */
export function toTitleCase(str) {
	return str
		.split(' ')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ')
}

/**
 * Converts a URL slug to a readable title.
 * Replaces hyphens with spaces and title-cases each word.
 *
 * @param {string} slug - URL slug like "artist-interview"
 * @returns {string} - Formatted title like "Artist Interview"
 */
export function slugToTitle(slug) {
	return toTitleCase(slug.replace(/-/g, ' '))
}

/**
 * Generates breadcrumb items from a URL path.
 *
 * @param {string} asPath - Current route path (e.g., "/blog/show-reviews/my-review")
 * @param {Object} options - Configuration options
 * @param {string} options.baseSegment - Segment to strip from path start (e.g., "blog")
 * @param {string} options.baseHref - Base href prefix (e.g., "/blog")
 * @param {string} options.baseText - Text for the root breadcrumb (e.g., "WXYC PRESS")
 * @param {number|null} options.pluralizeAtIndex - Index at which to add 's' suffix (null to disable)
 * @returns {Array<{href: string, text: string}>} - Array of breadcrumb items
 */
export function generateBreadcrumbs(asPath, options = {}) {
	const {
		baseSegment,
		baseHref,
		baseText,
		pluralizeAtIndex = null,
	} = options

	// Split path and filter empty segments
	const pathSegments = asPath.split('/').filter((v) => v.length > 0)

	// Remove base segment if it matches
	if (baseSegment && pathSegments[0] === baseSegment) {
		pathSegments.shift()
	}

	// Generate crumb list from remaining segments
	const crumblist = pathSegments.map((subpath, idx) => {
		// Build href by joining segments up to current index
		const href = baseHref + '/' + pathSegments.slice(0, idx + 1).join('/')

		// Convert slug to title
		let title = slugToTitle(subpath)

		// Add plural suffix if at specified index
		if (pluralizeAtIndex !== null && idx === pluralizeAtIndex) {
			title = title + 's'
		}

		return {href, text: title}
	})

	// Prepend root breadcrumb
	return [{href: baseHref, text: baseText}, ...crumblist]
}
