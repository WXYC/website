/**
 * Utilities for filtering Instagram posts based on blog post associations.
 *
 * When a blog post has an `instagramUrl` field set, the corresponding
 * Instagram post should be suppressed from the homepage feed to avoid
 * duplicate content.
 */

/**
 * Extracts the Instagram post ID from a full Instagram URL.
 *
 * Supports formats:
 * - https://www.instagram.com/p/ABC123/
 * - https://instagram.com/p/ABC123/
 * - https://www.instagram.com/p/ABC123
 * - https://www.instagram.com/reel/ABC123/
 *
 * @param {string} url - The full Instagram post URL
 * @returns {string|null} - The post ID or null if not found
 */
export function extractInstagramPostId(url) {
	if (!url) return null

	// Match /p/ID or /reel/ID patterns
	const match = url.match(/instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/)
	return match ? match[1] : null
}

/**
 * Gets a set of Instagram post IDs that should be suppressed,
 * based on the instagramUrl field in blog posts.
 *
 * @param {Array} blogPosts - Array of blog post edges from TinaCMS query
 * @returns {Set<string>} - Set of Instagram post IDs to suppress
 */
export function getSuppressedInstagramIds(blogPosts) {
	const suppressedIds = new Set()

	for (const post of blogPosts) {
		const url = post.node?.instagramUrl
		const postId = extractInstagramPostId(url)
		if (postId) {
			suppressedIds.add(postId)
		}
	}

	return suppressedIds
}

/**
 * Filters an array of Instagram posts, removing any that have
 * matching blog posts (based on the instagramUrl field).
 *
 * @param {Array} instagramPosts - Array of Instagram posts from the API
 * @param {Array} blogPosts - Array of blog post edges from TinaCMS query
 * @returns {Array} - Filtered Instagram posts with duplicates removed
 */
export function filterInstagramPosts(instagramPosts, blogPosts) {
	const suppressedIds = getSuppressedInstagramIds(blogPosts)

	return instagramPosts.filter((igPost) => {
		// Instagram API typically returns post ID in the `id` field
		// Adjust this based on the actual API response structure
		return !suppressedIds.has(igPost.id)
	})
}
