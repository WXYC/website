import EventPreview from '../../components/EventPreview'
import {client} from '../../tina/__generated__/client'
import {
	groupEventsByWeek,
	generateStructuredData,
} from '../../components/OrganizingArchive'
// import LazyLoad from 'react-lazyload';
import ArchiveDropdown from '../../components/DropdownArchive'
import ArchiveLayout from '../../components/ArchiveLayout'
import photo from '/images/crowd.jpg'
import mobilephoto from '/images/crowdmobile.jpeg'
import Image from 'next/image'
import React, {useState} from 'react'
import SeeMoreButton from '../../components/SeeMoreButton'
import {
	fetchCollectionNodes,
	sortByPublishedDesc,
	filterByPublishedWindow,
} from '../../lib/resilientPosts'

// Helper to safely extract description text from TinaCMS rich-text field
const getDescriptionText = (description, maxLength = 75) => {
	try {
		const text = description?.children?.[0]?.children?.[0]?.text
		return text ? text.substring(0, maxLength) : ''
	} catch {
		return ''
	}
}

// archive home page
export default function EventList(props) {
	const [eventsToShow, setEventsToShow] = useState(20)

	const loadMoreEvents = () => {
		setEventsToShow(eventsToShow + 20)
	}

	const eventsList = props.data.archiveConnection.edges
	const groupedEvents = groupEventsByWeek(eventsList)
	const structuredData = generateStructuredData(groupedEvents)

	let specialtyShows = []
	props.data.categoryConnection.edges.forEach((category) => {
		specialtyShows.push({
			label: category.node.title,
			value: category.node._sys.filename,
		})
	})

	return (
		<ArchiveLayout>
			<div className="relative z-10 -mt-2 flex w-full flex-col items-center justify-between md:w-5/6 md:flex-row">
				<div className="relative z-20 mt-5 text-sm md:text-base">
					An archive of WXYC&apos;s weekly specialty shows and events.{' '}
					<a href="../page/programming" className="underline">
						Learn more about WXYC&apos;s specialty programming.
					</a>
				</div>
				<div className="mt-3">
					<ArchiveDropdown specialtyShows={specialtyShows} />
				</div>
			</div>

			{/* Desktop banner image */}
			<div className="z-5 relative -mt-10 hidden md:block">
				<Image src={photo} alt="A crowded dancefloor at a WXYC event." />
			</div>

			{/* Mobile banner image */}
			<div className="relative z-10 -mt-10 md:hidden">
				<Image src={mobilephoto} alt="A crowded dancefloor at a WXYC event." />
			</div>

			<div className="archive-grid mx-auto lg:max-w-screen-xl">
				{structuredData.slice(0, eventsToShow).map((event) => (
					<div key={event.id}>
						{event.type === 'heading' && (
							<p className="mb-2 mt-10 text-3xl font-bold">
								Week of {event.weekStartDate}
							</p>
						)}
						{event.type === 'events' && (
							// needs unique key somehow
							<div>
								{event.weekEvents && (
									<div className="bg scrollbar flex flex-row justify-start gap-2 overflow-x-auto md:gap-4">
										{event.weekEvents.map((event) => (
											<div key={event.event.id}>
												{/* <LazyLoad height={200} once={true}> */}
												<EventPreview
													id={event.event.id}
													title={event.event.title}
													cover={event.event.cover}
													subtitle={getDescriptionText(event.event.description)}
													slug={event.event._sys.filename}
												/>
												{/* </LazyLoad> */}
											</div>
										))}
									</div>
								)}
							</div>
						)}
					</div>
				))}
			</div>

			{eventsToShow < structuredData.length && (
				<SeeMoreButton onClick={loadMoreEvents} />
			)}
		</ArchiveLayout>
	)
}

export const getStaticProps = async () => {
	const currentDateTime = new Date()
	const endOfWeek = new Date(
		currentDateTime.getFullYear(),
		currentDateTime.getMonth(),
		currentDateTime.getDate() + (6 - currentDateTime.getDay())
	)
	// Pull every event without server-side `sort`/`filter` on `published` (which
	// fails the whole export if any document has a stale `published` index), then
	// drop future events and order newest-first in JS. See lib/resilientPosts.js.
	const archiveNodes = await fetchCollectionNodes({
		client,
		collection: 'archive',
		fields: `
			id
			title
			cover
			published
			description
			_sys { filename }
		`,
		label: 'archive/index',
	})
	const archiveEdges = sortByPublishedDesc(
		filterByPublishedWindow(archiveNodes, {before: endOfWeek})
	).map((node) => ({node}))

	const {data: categoryData} = await client.request({
		query: `{
			categoryConnection(filter: {specialtyShow: {eq: true}}) {
				edges {
					node {
						id
						title
						_sys { filename }
					}
				}
			}
		}`,
	})

	return {
		props: {
			data: {
				archiveConnection: {edges: archiveEdges},
				categoryConnection: categoryData.categoryConnection,
			},
		},
	}
}
