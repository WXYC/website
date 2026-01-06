import {client} from '../tina/__generated__/client'
import PhotoGallery from '../components/homepage/PhotoGallery'
import ArchiveCarousel from '../components/homepage/ArchiveCarousel'
import BlogCarouselFull from '../components/homepage/BlogCarouselFull'
import HomepageBanner from '../components/HomepageBanner'
import Link from 'next/link'
import photo from '../images/logo.png'
import Image from 'next/image'
import AudioPlayerStream from '../components/audioplayers/AudioPlayerStream'

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

			{/* Header with WXYC logo lives here - desktop view */}
			<div className="mx-auto lg:flex hidden w-5/6 flex-col items-center justify-center pt-10 md:mb-10 md:pt-2 ">
				{/* Header text parent container */}
				<div className="mb-5 flex w-full flex-col items-center justify-center pt-20 lg:pt-1">
					{/* Actual header text */}
					<div className="flex w-full flex-col items-center justify-center lg:w-2/5 lg:pt-1">
						<Link href="/">
							<Image src={photo} alt="WXYC logo" priority className="cursor-pointer" />
						</Link>
						<h1 className="kallistobold m-0 mx-auto text-6xl font-bold text-white no-underline">
							89.3FM
						</h1>
						<div className="mt-2">
							<h3 className="poppins mx-auto w-full text-center text-base lg:text-base">
								UNC-Chapel Hill&apos;s student-run, freeform radio station
							</h3>
						</div>
						{/* Audio player below the logo on home page */}
						<div className="mt-6">
							<AudioPlayerStream />
						</div>
					</div>
				</div>
			</div>

			<div className="mx-auto flex w-5/6 flex-col gap-4">
				<div className="-mt-5 flex w-full flex-col justify-center md:-mt-10 md:mr-10 lg:mt-5">
					

					{/* if no events: just blog posts + player */}
					{events.length === 0 && posts && (
						<BlogCarouselFull posts={posts} />
					)}

					{/* if yes events: events + player */}
					{events.length > 0 && <ArchiveCarousel events={events} />}

					{/* if yes events: blog posts full row */}
					{events.length > 0 && posts && <BlogCarouselFull posts={posts} />}

					{/* "Submit a PSA" button on mobile */}
					<div className="lg:hidden flex w-full justify-center"> 
						<div className="mx-auto mt-10 flex h-16 w-4/6 md:w-2/6 flex-col items-center justify-center rounded-3xl bg-gradient-to-b from-neutral-200 to-neutral-400 text-xl text-black hover:text-neutral-700 lg:mx-0 ">
							<div>
								<a href="mailto:psa@wxyc.org">
									Submit a PSA!
								</a>
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
	const {data} = await client.request({
		query: `
    query getContent($startOfWeek: String, $endOfWeek: String)
    {    
        blogConnection(sort: "published", last:6, before: "cG9zdCNkYXRlIzE2NTc4Njg0MDAwMDAjY29udGVudC9wb3N0cy9hbm90aGVyUG9zdC5qc29u"){
          edges {
            node {
              id
              title
              cover
              published
              description
			  categories {
				category {
		  			... on Category {
						_sys {
							filename
						}
						title
					}
  				}
			}
              _sys {
                filename
              }
            }
          }
        },
       
      archiveConnection(filter: {published: {after: $startOfWeek, before: $endOfWeek}}, sort: "published", last:30, before: "cG9zdCNkYXRlIzE2NTc4Njg0MDAwMDAjY29udGVudC9wb3N0cy9hbm90aGVyUG9zdC5qc29u") {
        edges {
          node {
            id
            title
            cover
            published
			categories {
				category {
		  			... on Category {
						_sys {
							filename
						}
						title
					}
  				}
			}
            _sys {
              filename
            }
          }
        }
      },
  }
    
    `,
		variables: {
			endOfWeek: endOfWeek.toDateString(),
			startOfWeek: startOfWeek.toDateString(),
		},
	})

	return {props: {data}}
}
