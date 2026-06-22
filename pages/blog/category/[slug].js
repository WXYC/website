import {client} from '../../../tina/__generated__/client'
import PostPreview from '../../../components/PostPreview'
import BlogLayout from '../../../components/BlogLayout'
import SeeMoreButton from '../../../components/SeeMoreButton'
import React, {useState} from 'react'
import {STATIC_FALLBACK} from '../../../lib/staticPaths'
import {
	fetchCollectionNodes,
	sortByPublishedDesc,
} from '../../../lib/resilientPosts'

// filtering bog by category (either artist interview, show review, or album review)
const BlogCategoryPage = (props) => {
	const [postsToShow, setPostsToShow] = useState(18)

	const loadMorePosts = () => {
		setPostsToShow(postsToShow + 18)
	}

	let postsList = []
	if (props.data.blogConnection.edges.length > 0) {
		props.data.blogConnection.edges.forEach((post) => {
			postsList.push(post)
		})
	}

	const category = props.title.data.category.title

	return (
		<BlogLayout>
			<div className=" mx-auto w-5/6">
				<h1 className="kallisto mb-2 mt-2 text-3xl lg:text-5xl">{category}s</h1>
			</div>

			{postsList.length > 0 && (
				<div className="blog-grid mx-auto grid w-5/6 grid-cols-1 justify-around gap-4 pb-10 md:grid-cols-2 lg:grid-cols-3">
					{postsList.slice(0, postsToShow).map((post) => (
						<div key={post.node.id} className="mb-8">
							<PostPreview
								id={post.node.id}
								title={post.node.title}
								slug={post.node._sys.filename}
								cover={post.node.cover}
								subtitle={post.node.description}
							/>
						</div>
					))}
				</div>
			)}

			{postsToShow < postsList.length && (
				<SeeMoreButton onClick={loadMorePosts} />
			)}
		</BlogLayout>
	)
}

export default BlogCategoryPage

export const getStaticPaths = async () => {
	// const { data } = await client.queries.categoryConnection();
	// const paths = data.categoryConnection.edges.map((x) => {
	//   return { params: { slug: x.node._sys.filename } };
	// });
	const paths = [
		{params: {slug: 'show-review'}},
		{params: {slug: 'album-review'}},
		{params: {slug: 'artist-interview'}},
	]

	return {
		paths,
		fallback: STATIC_FALLBACK,
	}
}

export const getStaticProps = async (ctx) => {
	const title = await client.request({
		query: `
        query getTitle($relativePath: String) {
          category(relativePath: $relativePath) {
            title
          }
        }
      `,
		variables: {
			relativePath: ctx.params.slug + '.md',
		},
	})

	const categoryTitle = title.data.category.title

	// Pull every post without server-side `sort`/`filter` on `published` (which
	// fails the whole export if any document has a stale `published` index), then
	// keep only this category's posts and order them newest-first in JS.
	// See lib/resilientPosts.js.
	const blogNodes = await fetchCollectionNodes({
		connection: 'blogConnection',
		fields: `
			id
			title
			author
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
				.blog({relativePath: `${filename}.md`})
				.then((res) => res.data.blog),
		label: `blog/category/${ctx.params.slug}`,
	})
	const categoryPosts = blogNodes.filter((node) =>
		node.categories?.some((entry) => entry?.category?.title === categoryTitle)
	)
	const edges = sortByPublishedDesc(categoryPosts).map((node) => ({node}))

	return {
		props: {
			data: {blogConnection: {edges}},
			title,
		},
	}
}
