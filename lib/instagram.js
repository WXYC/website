/**
 * Instagram Graph API integration for fetching posts at build time.
 *
 * Required environment variables:
 * - INSTAGRAM_BUSINESS_ACCOUNT_ID: Your Instagram Business Account ID
 * - INSTAGRAM_ACCESS_TOKEN: Long-lived access token (valid 60 days)
 */

const INSTAGRAM_API_VERSION = 'v21.0'
const INSTAGRAM_API_BASE = `https://graph.facebook.com/${INSTAGRAM_API_VERSION}`

/**
 * Fetches recent Instagram posts for display on the website.
 *
 * @param {Object} options - Fetch options
 * @param {number} options.limit - Maximum number of posts to fetch (default: 12)
 * @returns {Promise<Array>} - Array of Instagram post objects
 */
export async function fetchInstagramPosts({limit = 12} = {}) {
	const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
	const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN

	if (!accountId || !accessToken) {
		console.warn(
			'Instagram credentials not configured. Set INSTAGRAM_BUSINESS_ACCOUNT_ID and INSTAGRAM_ACCESS_TOKEN in .env.local'
		)
		return []
	}

	const fields = [
		'id',
		'media_type',
		'media_url',
		'thumbnail_url',
		'permalink',
		'caption',
		'timestamp',
	].join(',')

	const url = `${INSTAGRAM_API_BASE}/${accountId}/media?fields=${fields}&limit=${limit}&access_token=${accessToken}`

	try {
		const response = await fetch(url)

		if (!response.ok) {
			const error = await response.json()
			console.error('Instagram API error:', error)
			return []
		}

		const data = await response.json()
		return data.data || []
	} catch (error) {
		console.error('Failed to fetch Instagram posts:', error)
		return []
	}
}

/**
 * Formats an Instagram post for display.
 * Normalizes the data structure for consistent rendering.
 *
 * @param {Object} post - Raw Instagram post from API
 * @returns {Object} - Formatted post object
 */
export function formatInstagramPost(post) {
	return {
		id: post.id,
		type: post.media_type?.toLowerCase(), // 'image', 'video', 'carousel_album'
		imageUrl: post.media_type === 'VIDEO' ? post.thumbnail_url : post.media_url,
		videoUrl: post.media_type === 'VIDEO' ? post.media_url : null,
		permalink: post.permalink,
		caption: post.caption || '',
		timestamp: post.timestamp,
		date: new Date(post.timestamp),
	}
}

/**
 * Fetches and formats Instagram posts, ready for display.
 *
 * @param {Object} options - Fetch options
 * @param {number} options.limit - Maximum number of posts to fetch
 * @returns {Promise<Array>} - Array of formatted Instagram posts
 */
export async function getInstagramFeed({limit = 12} = {}) {
	const posts = await fetchInstagramPosts({limit})
	return posts.map(formatInstagramPost)
}
