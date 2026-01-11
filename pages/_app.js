import React from 'react'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import '/styles/globals.css'
import {Layout} from '../components/Layout'
import {PostHogProvider} from 'posthog-js/react'
import {useEffect} from 'react'
import dynamic from 'next/dynamic'
import {initPostHog, usePostHogPageview, posthog} from '../lib/usePostHog'

// Dynamically import LavaLite to avoid SSR issues with WebGL
const LavaLiteBackground = dynamic(
	() => import('../components/LavaLiteBackground'),
	{ssr: false}
)

const App = ({Component, pageProps}) => {
	useEffect(() => {
		initPostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
			apiHost: process.env.NEXT_PUBLIC_POSTHOG_HOST,
		})
	}, [])

	usePostHogPageview()
	return (
		<PostHogProvider client={posthog}>
			<LavaLiteBackground brightness={0.85} />
			<div className="flex flex-col lg:items-center">
				<div className="m-0 flex h-full w-full flex-col overflow-hidden bg-transparent font-sans text-base text-white">
					<Layout>
						<Component {...pageProps} />
					</Layout>
				</div>
			</div>
		</PostHogProvider>
	)
}

export default App
