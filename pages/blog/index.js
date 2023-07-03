import { Layout } from "../../components/Layout";
import { client } from "../../tina/__generated__/client";
import PostPreview from "../../components/PostPreview.tsx";
import LazyLoad from 'react-lazyload';
import BlogHeader from "../../components/BlogHeader"

//blog home page
export default function PostList(props) {
  const postsList = props.data.blogConnection.edges;

  return (
    <Layout>
      <BlogHeader/>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 justify-around gap-4 w-5/6 mx-auto">
          {postsList.map((post) => (
          <LazyLoad height={200} once={true}>
            <PostPreview 
              id={post.node.id} 
              title={post.node.title} 
              slug={post.node._sys.filename} 
              cover={post.node.cover} 
              subtitle={ post.node.description ? post.node.description : post.node.body.children[0].children[0].text.substring(0, 150) }
            />
            </LazyLoad>
          ))}
        </div>
    </Layout>
  );
}

export const getStaticProps = async () => {
  const length = await client.request({
    query: `{
      blogConnection {
        totalCount
      }
    }`
  })

  const { data } = await client.request({
    query: `
    query getContent($postCount: Float)
    {
      blogConnection(sort: "published", last: $postCount, before: "cG9zdCNkYXRlIzE2NTc4Njg0MDAwMDAjY29udGVudC9wb3N0cy9hbm90aGVyUG9zdC5qc29u"){
        edges {
          node {
            id
            title
            cover
            published
            description
            body
            _sys {
              filename
            }
          }
        }
      }
    }
    `,
    variables: 
    {
      postCount: length.data.blogConnection.totalCount
    }
  })

  return { 
    props: {
      data,
    },
  };
};