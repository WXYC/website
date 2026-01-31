import {AiFillInstagram} from 'react-icons/ai'
import {FaPlay} from 'react-icons/fa'

/**
 * Instagram feed component for the homepage.
 * Displays a grid of recent Instagram posts with links to the original posts.
 */
const InstagramFeed = ({posts}) => {
	if (!posts || posts.length === 0) {
		return null
	}

	return (
		<div className="mt-16 flex flex-col lg:mt-20">
			<div className="mb-4 flex items-center gap-3">
				<AiFillInstagram size={36} className="text-pink-500" />
				<p className="kallisto text-3xl text-white lg:text-5xl">
					@wxyc893
				</p>
			</div>

			<div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 lg:gap-4">
				{posts.map((post) => (
					<a
						key={post.id}
						href={post.permalink}
						target="_blank"
						rel="noopener noreferrer"
						className="group relative aspect-square overflow-hidden rounded-lg bg-neutral-800"
					>
						{/* Post image */}
						<img
							src={post.imageUrl}
							alt={post.caption?.slice(0, 100) || 'Instagram post'}
							className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
							loading="lazy"
						/>

						{/* Video indicator */}
						{post.type === 'video' && (
							<div className="absolute right-2 top-2 rounded-full bg-black/60 p-2">
								<FaPlay size={12} className="text-white" />
							</div>
						)}

						{/* Carousel indicator */}
						{post.type === 'carousel_album' && (
							<div className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1">
								<span className="text-xs text-white">+</span>
							</div>
						)}

						{/* Hover overlay with caption preview */}
						<div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
							<p className="line-clamp-3 p-3 text-sm text-white">
								{post.caption?.slice(0, 120)}
								{post.caption?.length > 120 ? '...' : ''}
							</p>
						</div>
					</a>
				))}
			</div>

			{/* Link to full Instagram profile */}
			<div className="mt-6 flex justify-center md:justify-start">
				<a
					href="https://instagram.com/wxyc893"
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-2 text-white hover:underline"
				>
					<span>See more on Instagram</span>
					<span>{'>'}</span>
				</a>
			</div>
		</div>
	)
}

export default InstagramFeed
