import { Layout } from "../../../components/Layout";
import { client } from "../../../tina/__generated__/client";
import EventPreview from "../../../components/EventPreview";
import {groupEventsByWeek, generateStructuredData} from '../../../components/OrganizingArchive';
import Link from "next/link";
import ArchiveHeader from "../../../components/ArchiveHeader";

const EventsCategoryPage = (props) => {

  let structuredData = [];
  let sortedEvents = [];

  if (props.data.archiveConnection.edges.length > 0) {
    props.data.archiveConnection.edges.forEach((event) => {
      sortedEvents.push(event);
    })
    const groupedEvents = groupEventsByWeek(sortedEvents);
    structuredData = generateStructuredData(groupedEvents);
  }

  let specialtyShows = [];
  props.data.categoryConnection.edges.forEach((category) => {
    specialtyShows.push({ label: category.node.title, value: category.node._sys.filename});
  });

  return (
    <Layout>
      <ArchiveHeader specialtyShows={specialtyShows}/>
      <Link href="/archive">
        <p>← Back</p>
      </Link>
      <h1>Events</h1>

      {(structuredData.length > 0) && 
      <div>
        <div className="archive-grid">
        {structuredData.map((event) => (
            <div key={event.id}>
                {(event.type === 'heading') && <h3>week of {event.weekStartDate}</h3>}
                {(event.type === 'events' &&
                <div>
                {event.weekEvents && <div className="events-row">
                    {event.weekEvents.map((event) => (
                        <EventPreview
                        id={event.event.id}
                        title={event.event.title}
                        cover={event.event.cover}
                        subtitle={event.event.description.children[0].children[0].text.substring(0, 150)}
                        slug={event.event._sys.filename}
                      />
                    ))}
                    </div>}
                </div>)}
            </div>

        ))}
      </div>
    </div>}
    </Layout>
  );
}

export default EventsCategoryPage;


export const getStaticProps = async () => {
  const { data } = await client.request({
    query: `
      {
      archiveConnection(filter: {categories: {category: {category: {title: {eq: "Event"}}}}}, sort: "published", last:30, before: "cG9zdCNkYXRlIzE2NTc4Njg0MDAwMDAjY29udGVudC9wb3N0cy9hbm90aGVyUG9zdC5qc29u") {
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
  }`
  })

  return { 
    props: {
      data
    },
  };
}