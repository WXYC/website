import {TinaMarkdown} from 'tinacms/dist/rich-text'
import {tinaField, useTina} from 'tinacms/dist/react'
import {client} from '../../tina/__generated__/client'
import AboutLayout from '../../components/AboutLayout'

// First Simulcast page with custom image styling
export default function FirstSimulcastPage(props) {
	const {data} = useTina({
		query: props.query,
		variables: props.variables,
		data: props.data,
	})

	const content = data.page.body

	return (
		<AboutLayout>
			<div data-tina-field={tinaField(data.page, 'body')}>
				<div className="mx-auto flex w-5/6 flex-row justify-center">
					<article className="prose prose-lg text-white prose-h1:font-kallisto prose-h1:text-5xl prose-h1:font-normal prose-h1:text-white prose-h3:font-normal prose-h3:text-white prose-strong:text-white prose-a:text-blue-500 [&_img:first-of-type]:max-w-full [&_img:first-of-type]:w-full [&_img:not(:first-of-type)]:float-right [&_img:not(:first-of-type)]:ml-6 [&_img:not(:first-of-type)]:mb-4 [&_img:not(:first-of-type)]:max-w-[200px] [&_img:not(:first-of-type)]:clear-right">
						<TinaMarkdown content={content} />
					</article>
				</div>
			</div>
		</AboutLayout>
	)
}

export const getStaticProps = async () => {
	const {data, query, variables} = await client.queries.page({
		relativePath: 'first.mdx',
	})

	return {
		props: {
			data,
			query,
			variables,
		},
	}
}
