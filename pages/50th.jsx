import Head from 'next/head'
import {TinaMarkdown} from 'tinacms/dist/rich-text'
import {tinaField, useTina} from 'tinacms/dist/react'
import {client} from '../tina/__generated__/client'
import FiftiethAnniversary from '../components/FiftiethAnniversary'

// WXYC's 50th anniversary, October 15th-17th 2027 — the page the station
// sends alumni to. Tina wiring only; the markup and the alumni-form button
// live in components/FiftiethAnniversary.jsx so they can be tested without
// the generated Tina client (see that file's comment).
export default function Fiftieth(props) {
	const {data} = useTina({
		query: props.query,
		variables: props.variables,
		data: props.data,
	})

	return (
		<>
			<Head>
				<title>50th Anniversary | WXYC</title>
				<meta
					name="description"
					content="WXYC's 50th anniversary is October 15th-17th, 2027. Alumni: save the date, and add yourself to the station's alumni database."
				/>
			</Head>

			<FiftiethAnniversary bodyField={tinaField(data.page, 'body')}>
				<TinaMarkdown content={data.page.body} />
			</FiftiethAnniversary>
		</>
	)
}

export const getStaticProps = async () => {
	const {data, query, variables} = await client.queries.page({
		relativePath: '50th.mdx',
	})

	return {
		props: {
			data,
			query,
			variables,
		},
	}
}
