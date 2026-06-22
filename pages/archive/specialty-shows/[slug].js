import {client} from '../../../tina/__generated__/client'
import EventPreview from '../../../components/EventPreview'
import {
	groupEventsByWeek,
	generateStructuredData,
} from '../../../components/OrganizingArchive'
import ArchiveLayout from '../../../components/ArchiveLayout'
import React, {useState} from 'react'
import SeeMoreButton from '../../../components/SeeMoreButton'
import {STATIC_FALLBACK} from '../../../lib/staticPaths'
import {
	fetchCollectionNodes,
	sortByPublishedDesc,
	filterByPublishedWindow,
} from '../../../lib/resilientPosts'

// Helper to safely extract description text from TinaCMS rich-text field
const getDescriptionText = (description, maxLength = 75) => {
	try {
		const text = description?.children?.[0]?.children?.[0]?.text
		return text ? text.substring(0, maxLength) : ''
	} catch {
		return ''
	}
}

// filter archive by a specific specialty show
const ArchiveCategoryPage = (props) => {
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

	const category = props.title.data.category.title
	const description = props.title.data.category.description

	let specialtyShows = []
	props.data.categoryConnection.edges.forEach((category) => {
		specialtyShows.push({
			label: category.node.title,
			value: category.node._sys.filename,
		})
	})

	return (
		<ArchiveLayout specialtyShows={specialtyShows}>
			<div className="mx-auto w-full">
				<p className="kallisto mb-10 mt-2 text-5xl">{category}s</p>
				{description && <p className="mb-10 w-3/5">{description}</p>}
			</div>

			{structuredData.length > 0 && (
				<div>
					<div className="archive-grid mx-auto w-full">
						{structuredData.slice(0, eventsToShow).map((event) => (
							<div className="mb-7" key={event.id}>
								{event.type === 'heading' && (
									<p className="text-3xl font-bold">
										Week of {event.weekStartDate}
									</p>
								)}
								{event.type === 'events' && (
									<div>
										{event.weekEvents && (
											<div className="events-row">
												{event.weekEvents.map((event) => (
													<EventPreview
														key={event.event.id} // Add key prop here
														id={event.event.id}
														title={event.event.title}
														cover={event.event.cover}
														subtitle={getDescriptionText(
															event.event.description
														)}
														slug={event.event._sys.filename}
													/>
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

export default ArchiveCategoryPage

export const getStaticPaths = async () => {
	const {data} = await client.queries.categoryConnection()
	const paths = data.categoryConnection.edges.map((x) => {
		return {params: {slug: x.node._sys.filename}}
	})

	return {
		paths,
		fallback: STATIC_FALLBACK,
	}
}

export const getStaticProps = async (ctx) => {
	const currentDateTime = new Date()
	const endOfWeek = new Date(
		currentDateTime.getFullYear(),
		currentDateTime.getMonth(),
		currentDateTime.getDate() + (6 - currentDateTime.getDay())
	)

	const title = await client.request({
		query: `
      query getTitle($relativePath: String) {
        category(relativePath: $relativePath) {
          title
          description
        }
      }
    `,
		variables: {
			relativePath: ctx.params.slug + '.md',
		},
	})

	const categoryTitle = title.data.category.title

	// Pull every event without server-side `sort`/`filter` on `published` (which
	// fails the whole export if any document has a stale `published` index), then
	// keep only this show's already-aired events and order them newest-first in
	// JS. See lib/resilientPosts.js.
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
		label: `archive/specialty-shows/${ctx.params.slug}`,
	})
	const showEvents = filterByPublishedWindow(archiveNodes, {
		before: endOfWeek,
	}).filter((node) =>
		node.categories?.some((entry) => entry?.category?.title === categoryTitle)
	)
	const archiveEdges = sortByPublishedDesc(showEvents).map((node) => ({node}))

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
			title,
		},
	}
}
