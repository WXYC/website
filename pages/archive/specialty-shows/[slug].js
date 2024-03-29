import {client} from '../../../tina/__generated__/client'
import EventPreview from '../../../components/EventPreview'
import {
	groupEventsByWeek,
	generateStructuredData,
} from '../../../components/OrganizingArchive'
import ArchiveLayout from '../../../components/ArchiveLayout'
import React, {useState} from 'react'
import SeeMoreButton from '../../../components/SeeMoreButton'

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
														subtitle={event.event.description.children[0].children[0].text.substring(
															0,
															75
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
		fallback: 'blocking',
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

	const {data} = await client.request({
		query: `
      query getContent($title: String, $endOfWeek: String) {
      archiveConnection(filter: {categories: {category: {category: {title: {eq: $title}}}}, published: {before: $endOfWeek}}, sort: "published", last: 30, before: "cG9zdCNkYXRlIzE2NTc4Njg0MDAwMDAjY29udGVudC9wb3N0cy9hbm90aGVyUG9zdC5qc29u") {
      edges {
        node {
          id
          title
          description
          cover
          published
          _sys {
            filename
          }
        }
      }
    },
    categoryConnection(filter: {specialtyShow: { eq:true}}) {
      edges {
        node {
          id
          title
          _sys {
            filename
          }
        }
      }
    }

  }`,
		variables: {
			title: title.data.category.title,
			endOfWeek: endOfWeek.toDateString(),
		},
	})

	return {
		props: {
			data,
			title,
		},
	}
}
