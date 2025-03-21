import Link from 'next/link'
import AudioPlayerStream from '../audioplayers/AudioPlayerStream'
import PostPreview from '../PostPreview'

// There are two BlogCarousel components. On desktop, if there is content in the "WXYC This Week" section, the blog post carousel renders underneath "WXYC This Week" and the audio player at full-screen (BlogCarouselFull.js) However, if there is no content in "WXYC This Week", BlogCarouselCropped.js is called, and is aligned with the audio player.

const BlogCarouselCropped = (props) => {
	return (
		<div>
			<div className="flex w-full flex-col lg:flex-row">
				<div className="-mt-5 flex flex-col justify-center md:-mt-10 md:mr-10 lg:mt-5 lg:w-4/6 lg:max-w-screen-lg">
					<p className="kallisto mx-auto mb-2 whitespace-nowrap text-3xl text-white md:mx-0 md:mb-4 lg:text-5xl">
						Blog Posts
					</p>

					<div className="mx-auto md:mx-0">
						<div className=" scrollbar mx-auto mb-10 mt-6 flex snap-mandatory flex-col gap-6 md:mt-0 md:flex-row md:gap-4 md:overflow-x-auto">
							{props.posts.map((post) => (
								// Blog post previews
								<div key={post.node.id}>
									<PostPreview
										id={post.node.id}
										title={post.node.title}
										slug={post.node._sys.filename}
										cover={post.node.cover}
										subtitle={post.node.description}
										categories={post.node.categories}
									/>
								</div>
							))}
						</div>
					</div>
					<div className="w-1/8 mx-14 mb-16 flex justify-center rounded-3xl bg-neutral-800 px-3 py-2 md:hidden">
						<Link href="/blog">
							<p className="my-1 cursor-pointer hover:underline">
								Older Blog Posts {'>'}
							</p>
						</Link>
					</div>
				</div>

				{/* player */}
				<div className="ml-0 mr-3 mt-12 hidden items-start px-3 lg:flex lg:flex-col">
					<p className="kallisto text-left text-3xl">Listen Live</p>
					{/* <iframe src={`https://dj.wxyc.org/#/NowPlaying?theme=dark`} className="border-0 w-full h-[17.6rem] mt-5 mb-12 flex items-center overflow-hidden"/> */}

					<div className="pt-7">
						<AudioPlayerStream />
					</div>

					<div className="flex w-full justify-center">
						<div className="mx-auto mt-10 flex h-16 w-4/6 flex-col items-center justify-center rounded-3xl bg-gradient-to-b from-neutral-200 to-neutral-400 text-xl text-black hover:text-neutral-700 lg:mx-0 ">
							<div>
								<Link href="mailto:psa@wxyc.org" scroll={false}>
									Submit a PSA!
								</Link>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div className="w-1/8 mx-auto mb-16 hidden rounded-3xl bg-neutral-800 px-3 py-2 md:mx-0 md:ml-auto md:flex md:h-full md:w-full md:items-start md:justify-start md:bg-transparent md:px-0 md:py-0">
				<Link href="/blog">
					<p className="my-1 cursor-pointer hover:underline">
						Older Blog Posts {'>'}
					</p>
				</Link>
			</div>
		</div>
	)
}

export default BlogCarouselCropped
