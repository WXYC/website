import {useEffect} from 'react'
import {Router} from 'next/router'
import posthog from 'posthog-js'

export function initPostHog(key, options = {}) {
	posthog.init(key, {
		api_host: options.apiHost || 'https://us.i.posthog.com',
		person_profiles: 'identified_only',
		loaded: (posthog) => {
			if (process.env.NODE_ENV === 'development') posthog.debug()
		},
		...options,
	})
}

/**
 * Capture a PostHog `$pageview` on every real navigation between pages.
 *
 * Shallow route changes are deliberately excluded. `router.push` and
 * `router.replace` with `{shallow: true}` rewrite the query string and
 * re-render the same page in place — they do not fetch data methods and they
 * do not change which page you are on — but Next's Pages Router still emits
 * `routeChangeComplete` for them, so a handler that ignores the second
 * argument counts every one as a view.
 *
 * Three surfaces page that way, and they are not equally harmless. The
 * archive's week picker and the live playlist's set controls fire one per
 * click. The airplay search box rewrites `?q=` every time the debounced query
 * settles, so a single search typed in three bursts bills as three views of a
 * page nobody navigated to. The org's PostHog is on the free tier, and the
 * numbers this inflates — views per page, entry paths, bounce — are exactly
 * the ones a reader would take at face value.
 *
 * This is not a decision to stop measuring in-page navigation. If stepping
 * between sets or weeks is worth counting, it is worth a named custom event
 * that says so; `$pageview` is a claim about pages.
 */
export function usePostHogPageview() {
	useEffect(() => {
		// Defaulted rather than destructured bare: the options argument is
		// documented, but throwing inside a router event listener would be a
		// worse failure than a miscounted view.
		const handleRouteChange = (url, {shallow} = {}) => {
			if (shallow) return
			posthog?.capture('$pageview')
		}

		Router.events.on('routeChangeComplete', handleRouteChange)

		return () => {
			Router.events.off('routeChangeComplete', handleRouteChange)
		}
	}, [])
}

export {posthog}
