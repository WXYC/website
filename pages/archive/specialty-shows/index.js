import {client} from '../../../tina/__generated__/client'
import EventPreview from '../../../components/EventPreview'
import {
	groupEventsByWeek,
	generateStructuredData,
} from '../../../components/OrganizingArchive'
import Link from 'next/link'
import ArchiveLayout from '../../../components/ArchiveLayout'
import React, {useState} from 'react'
import SeeMoreButton from '../../../components/SeeMoreButton'
import {
	fetchCollectionNodes,
	sortByPublishedDesc,
	filterByPublishedWindow,
} from '../../../lib/resilientPosts'

// page filtering for all specialty shows
const SpecialtyShowsPage = (props) => {
	const [eventsToShow, setEventsToShow] = useState(20)

	const loadMoreEvents = () => {
		setEventsToShow(eventsToShow + 20)
	}

	let structuredData = []
	let sortedEvents = []

	if (props.data.archiveConnection.edges.length > 0) {
		props.data.archiveConnection.edges.forEach((event) => {
			sortedEvents.push(event)
		})
		const groupedEvents = groupEventsByWeek(sortedEvents)
		structuredData = generateStructuredData(groupedEvents)
	}

	let specialtyShows = []
	props.data.categoryConnection.edges.forEach((category) => {
		specialtyShows.push({
			label: category.node.title,
			value: category.node._sys.filename,
		})
	})

	return (
		<ArchiveLayout specialtyShows={specialtyShows}>
			<h1 className="kallisto my-2 text-5xl">All Specialty Shows</h1>
			<p className="mb-10 text-lg">
				Click{' '}
				<Link href="../programming">
					<u className="cursor-pointer">here</u>
				</Link>{' '}
				for a list of all specialty shows and their descriptions.
			</p>

			{structuredData.length > 0 && (
				<div>
					<div className="archive-grid mx-auto w-full">
						{structuredData.slice(0, eventsToShow).map((event) => (
							<div key={event.id}>
								{event.type === 'heading' && (
									<h3 className="mb-2 mt-10 text-3xl font-bold">
										Week of {event.weekStartDate}
									</h3>
								)}
								{event.type === 'events' && (
									<div key={event.id}>
										{event.weekEvents && (
											<div className="bg scrollbar flex flex-row justify-start gap-2 overflow-x-auto md:gap-4">
												{event.weekEvents.map((event) => (
													<div key={event.event.id}>
														<EventPreview
															id={event.event.id}
															title={event.event.title}
															cover={event.event.cover}
															subtitle={event.event.description.children[0].children[0].text.substring(
																0,
																75
															)}
															slug={event.event._sys.filename}
														/>
													</div>
												))}
											</div>
										)}
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			)}

			{eventsToShow < structuredData.length && (
				<SeeMoreButton onClick={loadMoreEvents} />
			)}
		</ArchiveLayout>
	)
}

export default SpecialtyShowsPage

export const getStaticProps = async () => {
	const currentDateTime = new Date()
	const endOfWeek = new Date(
		currentDateTime.getFullYear(),
		currentDateTime.getMonth(),
		currentDateTime.getDate() + (6 - currentDateTime.getDay())
	)
	// Pull every event without server-side `sort`/`filter` on `published` (which
	// fails the whole export if any document has a stale `published` index), then
	// keep only Specialty Show events that have already aired and order them
	// newest-first in JS. See lib/resilientPosts.js.
	const archiveNodes = await fetchCollectionNodes({
		connection: 'archiveConnection',
		fields: `
			id
			title
			description
			cover
			published
			categories {
				category {
					... on Category {
						title
					}
				}
			}
			_sys { filename }
		`,
		request: (query) => client.request(query),
		fetchOne: (filename) =>
			client.queries
				.archive({relativePath: `${filename}.md`})
				.then((res) => res.data.archive),
		label: 'archive/specialty-shows',
	})
	const specialtyShowEvents = filterByPublishedWindow(archiveNodes, {
		before: endOfWeek,
	}).filter((node) =>
		node.categories?.some(
			(entry) => entry?.category?.title === 'Specialty Show'
		)
	)
	const archiveEdges = sortByPublishedDesc(specialtyShowEvents).map((node) => ({
		node,
	}))

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
