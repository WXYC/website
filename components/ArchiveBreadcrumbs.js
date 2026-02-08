import Crumb from './SingleCrumb'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import {useRouter} from 'next/router'
import React from 'react'
import {IoIosArrowForward} from 'react-icons/io'
import {generateBreadcrumbs} from '../lib/breadcrumbUtils'

export default function ArchiveBreadcrumbs() {
	// get current route details
	const router = useRouter()

	const breadcrumbs = React.useMemo(
		() =>
			generateBreadcrumbs(router.asPath, {
				baseSegment: 'archive',
				baseHref: '/archive',
				baseText: 'Archive',
			}),
		[[router.asPath]]
	) // re-run every time route changes

	return (
		<Breadcrumbs
			aria-label="breadcrumb"
			separator={<IoIosArrowForward size={18} className="ml-1 mt-0.5" />}
			color="white"
		>
			{breadcrumbs.map((crumb, idx) => (
				<Crumb {...crumb} key={idx} last={idx === breadcrumbs.length - 1} />
			))}
		</Breadcrumbs>
	)
}
