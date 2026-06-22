import {client} from '../tina/__generated__/client'
import PhotoGallery from '../components/homepage/PhotoGallery'
import ArchiveCarousel from '../components/homepage/ArchiveCarousel'
import BlogCarouselFull from '../components/homepage/BlogCarouselFull'
import HomepageBanner from '../components/HomepageBanner'
import Link from 'next/link'
import photo from '../images/logo.png'
import Image from 'next/image'
import {
	fetchCollectionNodes,
	sortByPublishedDesc,
	filterByPublishedWindow,
} from '../lib/resilientPosts'

// home page
export default function Home(props) {
	const posts = props.data.blogConnection.edges
	const events = props.data.archiveConnection.edges

	return (
		<div>
			<div>
				{/* HomepageBanner is a component for adding a closeable banner announcement to the homepage. Toggle on or off in Components > HomepageBanner.js */}
				<HomepageBanner />
			</div>

			{/* Header with WXYC logo lives here */}
			<div className="mx-auto hidden w-5/6 flex-col items-start justify-center pt-10 md:mb-10 md:pt-2 lg:flex ">
				<Link href="/">
					{/* Header text parent container */}
					<div className="mb-20 flex w-full  cursor-pointer flex-col items-center justify-center pt-20 md:flex-row md:items-end md:pt-20 lg:mb-5 lg:pt-1">
						{/* Actual header text */}
						<div className="flex w-full flex-col items-center justify-center md:w-3/4 md:pt-20 lg:w-2/5 lg:pt-1">
							<Image src={photo} alt="Picture of the author" priority />
							<h1 className=" kallistobold m-0 mx-auto text-6xl font-bold text-white no-underline">
								89.3FM
							</h1>
							<div className="mt-2">
								<h3 className="mx-auto w-full text-center font-sans text-base md:mx-0  md:text-xl lg:text-base">
									UNC-Chapel Hill&apos;s student-run, freeform radio station
								</h3>
							</div>
						</div>
					</div>
				</Link>
			</div>

			<div className="mx-auto flex w-5/6 flex-col gap-4">
				<div className="-mt-5 flex w-full flex-col justify-center md:-mt-10 md:mr-10 lg:mt-5">
					{/* if no events: just blog posts + player */}
					{events.length === 0 && posts && <BlogCarouselFull posts={posts} />}

					{/* if yes events: events + player */}
					{events.length > 0 && <ArchiveCarousel events={events} />}

					{/* if yes events: blog posts full row */}
					{events.length > 0 && posts && <BlogCarouselFull posts={posts} />}

					{/* "Submit a PSA" button on mobile */}
					<div className="flex w-full justify-center lg:hidden">
						<div className="mx-auto mt-10 flex h-16 w-4/6 flex-col items-center justify-center rounded-3xl bg-gradient-to-b from-neutral-200 to-neutral-400 text-xl text-black hover:text-neutral-700 md:w-2/6 lg:mx-0 ">
							<div>
								<a href="mailto:psa@wxyc.org">Submit a PSA!</a>
							</div>
						</div>
					</div>

					{/* Photo gallery */}
					<div className="mx-auto mt-16 hidden w-5/6 items-center justify-center md:visible md:flex">
						<PhotoGallery />
					</div>
				</div>
			</div>
		</div>
	)
}

// Shared node selection for the blog + archive carousels. Both render category
// chips, so both pull the nested category reference.
const CAROUSEL_FIELDS = `
	id
	title
	cover
	published
	description
	categories {
		category {
			... on Category {
				_sys { filename }
				title
			}
		}
	}
	_sys { filename }
`

export const getStaticProps = async () => {
	const currentDateTime = new Date()
	const startOfWeek = new Date(
		currentDateTime.getFullYear(),
		currentDateTime.getMonth(),
		currentDateTime.getDate() - currentDateTime.getDay() - 1
	)
	const endOfWeek = new Date(
		currentDateTime.getFullYear(),
		currentDateTime.getMonth(),
		currentDateTime.getDate() + (8 - currentDateTime.getDay())
	)

	const request = (query) => client.request(query)

	// Both collections are pulled without server-side `sort`/`filter` on
	// `published`, then ordered and windowed in JS, so a single document with a
	// stale `published` index can't fail the whole homepage export.
	// See lib/resilientPosts.js.
	const blogNodes = await fetchCollectionNodes({
		connection: 'blogConnection',
		fields: CAROUSEL_FIELDS,
		request,
		fetchOne: (filename) =>
			client.queries
				.blog({relativePath: `${filename}.md`})
				.then((res) => res.data.blog),
		label: 'home/blog',
	})
	const blogEdges = sortByPublishedDesc(blogNodes)
		.slice(0, 6)
		.map((node) => ({node}))

	const archiveNodes = await fetchCollectionNodes({
		connection: 'archiveConnection',
		fields: CAROUSEL_FIELDS,
		request,
		fetchOne: (filename) =>
			client.queries
				.archive({relativePath: `${filename}.md`})
				.then((res) => res.data.archive),
		label: 'home/archive',
	})
	const archiveEdges = sortByPublishedDesc(
		filterByPublishedWindow(archiveNodes, {
			after: startOfWeek,
			before: endOfWeek,
		})
	)
		.slice(0, 30)
		.map((node) => ({node}))

	return {
		props: {
			data: {
				blogConnection: {edges: blogEdges},
				archiveConnection: {edges: archiveEdges},
			},
		},
	}
}
