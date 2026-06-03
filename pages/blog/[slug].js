import {useTina} from 'tinacms/dist/react'
import {client} from '../../tina/__generated__/client'
import {TinaMarkdown} from 'tinacms/dist/rich-text'
import Link from 'next/link'
import BlogLayout from '../../components/BlogLayout'
import {STATIC_FALLBACK} from '../../lib/staticPaths'
import {fetchAllEdges, TINA_PAGE_SIZE} from '../../lib/tinaPagination'

// const components = {
// 	// google drive embedded iframe mp3
// 	AudioFileGD: (props) => {
// 		return (
// 			<>
// 				<AudioPlayerEmbed url={props.url} />
// 			</>
// 		)
// 	},
// }

// individual blog post page
const PostPage = (props) => {
	const {data, query, variables} = useTina({
		query: props.query,
		variables: props.variables,
		data: props.data,
	})

	const date = new Date(data.blog.published)
	const options = {month: 'long', day: 'numeric', year: 'numeric'}
	const displayDate = date.toLocaleString('en-US', options)

	return (
		<BlogLayout>
			<div className="mx-auto flex w-5/6 flex-col items-center pb-10">
				{data.blog.categories && (
					<div>
						{data.blog.categories.map((category) => (
							<div className="my-2 text-neutral-400" key={category.category.id}>
								<Link
									href={`/blog/category/${category.category._sys.filename}`}
								>
									<p className="cursor-pointer hover:underline">
										{category.category.title}
									</p>
								</Link>
							</div>
						))}
					</div>
				)}
				<h1 className="kallisto m-5 text-center text-3xl lg:text-5xl">
					{data.blog.title}
				</h1>
				<p className="italic">{displayDate}</p>
				<h3 className="mb-3"> By {data.blog.author}</h3>
				<p className="my-9 text-lg italic lg:w-3/6 xl:w-3/5">
					{data.blog.description}
				</p>
				<img
					src={data.blog.cover}
					alt=""
					width="650px"
					className="my-8 mb-20 max-h-[40rem] object-cover"
				/>

				<article className="prose prose-lg bg-neutral-800 bg-opacity-70 px-5 py-2 text-white prose-h1:text-slate-500 prose-h2:text-slate-500 prose-h3:text-white prose-a:text-slate-700 prose-strong:text-slate-400 prose-em:italic prose-li:mb-1 lg:max-w-[60%]">
					{/* <TinaMarkdown content={data.blog.body} components={components} /> */}
					<TinaMarkdown content={data.blog.body} />
				</article>
			</div>
		</BlogLayout>
	)
}

export default PostPage

export const getStaticPaths = async () => {
	const edges = await fetchAllEdges(async (after) => {
		const {data} = await client.request({
			query: `
				query GetBlogSlugs($first: Float, $after: String) {
					blogConnection(first: $first, after: $after) {
						edges { node { _sys { filename } } }
						pageInfo { hasNextPage endCursor }
					}
				}
			`,
			variables: {first: TINA_PAGE_SIZE, after},
		})
		return data.blogConnection
	})
	const paths = edges.map((x) => ({params: {slug: x.node._sys.filename}}))

	return {
		paths,
		fallback: STATIC_FALLBACK,
	}
}

export const getStaticProps = async (ctx) => {
	const {data, query, variables} = await client.queries.blog({
		relativePath: ctx.params.slug + '.md',
	})

	return {
		props: {
			data,
			query,
			variables,
		},
	}
}
