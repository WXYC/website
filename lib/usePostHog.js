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

export function usePostHogPageview() {
	useEffect(() => {
		const handleRouteChange = () => posthog?.capture('$pageview')

		Router.events.on('routeChangeComplete', handleRouteChange)

		return () => {
			Router.events.off('routeChangeComplete', handleRouteChange)
		}
	}, [])
}

export {posthog}
