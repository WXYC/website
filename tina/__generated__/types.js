export function gql(strings, ...args) {
  let str = "";
  strings.forEach((string, i) => {
    str += string + (args[i] || "");
  });
  return str;
}
export const PagePartsFragmentDoc = gql`
    fragment PageParts on Page {
  body
}
    `;
export const BlogPartsFragmentDoc = gql`
    fragment BlogParts on Blog {
  title
  author
  cover
  categories {
    __typename
    category {
      ... on Category {
        title
        specialtyShow
        description
      }
      ... on Document {
        _sys {
          filename
          basename
          breadcrumbs
          path
          relativePath
          extension
        }
        id
      }
    }
  }
  published
  description
  body
}
    `;
export const ArchivePartsFragmentDoc = gql`
    fragment ArchiveParts on Archive {
  title
  cover
  categories {
    __typename
    category {
      ... on Category {
        title
        specialtyShow
        description
      }
      ... on Document {
        _sys {
          filename
          basename
          breadcrumbs
          path
          relativePath
          extension
        }
        id
      }
    }
  }
  published
  description
}
    `;
export const CategoryPartsFragmentDoc = gql`
    fragment CategoryParts on Category {
  title
  specialtyShow
  description
}
    `;
export const PageDocument = gql`
    query page($relativePath: String!) {
  page(relativePath: $relativePath) {
    ... on Document {
      _sys {
        filename
        basename
        breadcrumbs
        path
        relativePath
        extension
      }
      id
    }
    ...PageParts
  }
}
    ${PagePartsFragmentDoc}`;
export const PageConnectionDocument = gql`
    query pageConnection($before: String, $after: String, $first: Float, $last: Float, $sort: String, $filter: PageFilter) {
  pageConnection(
    before: $before
    after: $after
    first: $first
    last: $last
    sort: $sort
    filter: $filter
  ) {
    pageInfo {
      hasPreviousPage
      hasNextPage
      startCursor
      endCursor
    }
    totalCount
    edges {
      cursor
      node {
        ... on Document {
          _sys {
            filename
            basename
            breadcrumbs
            path
            relativePath
            extension
          }
          id
        }
        ...PageParts
      }
    }
  }
}
    ${PagePartsFragmentDoc}`;
export const BlogDocument = gql`
    query blog($relativePath: String!) {
  blog(relativePath: $relativePath) {
    ... on Document {
      _sys {
        filename
        basename
        breadcrumbs
        path
        relativePath
        extension
      }
      id
    }
    ...BlogParts
  }
}
    ${BlogPartsFragmentDoc}`;
export const BlogConnectionDocument = gql`
    query blogConnection($before: String, $after: String, $first: Float, $last: Float, $sort: String, $filter: BlogFilter) {
  blogConnection(
    before: $before
    after: $after
    first: $first
    last: $last
    sort: $sort
    filter: $filter
  ) {
    pageInfo {
      hasPreviousPage
      hasNextPage
      startCursor
      endCursor
    }
    totalCount
    edges {
      cursor
      node {
        ... on Document {
          _sys {
            filename
            basename
            breadcrumbs
            path
            relativePath
            extension
          }
          id
        }
        ...BlogParts
      }
    }
  }
}
    ${BlogPartsFragmentDoc}`;
export const ArchiveDocument = gql`
    query archive($relativePath: String!) {
  archive(relativePath: $relativePath) {
    ... on Document {
      _sys {
        filename
        basename
        breadcrumbs
        path
        relativePath
        extension
      }
      id
    }
    ...ArchiveParts
  }
}
    ${ArchivePartsFragmentDoc}`;
export const ArchiveConnectionDocument = gql`
    query archiveConnection($before: String, $after: String, $first: Float, $last: Float, $sort: String, $filter: ArchiveFilter) {
  archiveConnection(
    before: $before
    after: $after
    first: $first
    last: $last
    sort: $sort
    filter: $filter
  ) {
    pageInfo {
      hasPreviousPage
      hasNextPage
      startCursor
      endCursor
    }
    totalCount
    edges {
      cursor
      node {
        ... on Document {
          _sys {
            filename
            basename
            breadcrumbs
            path
            relativePath
            extension
          }
          id
        }
        ...ArchiveParts
      }
    }
  }
}
    ${ArchivePartsFragmentDoc}`;
export const CategoryDocument = gql`
    query category($relativePath: String!) {
  category(relativePath: $relativePath) {
    ... on Document {
      _sys {
        filename
        basename
        breadcrumbs
        path
        relativePath
        extension
      }
      id
    }
    ...CategoryParts
  }
}
    ${CategoryPartsFragmentDoc}`;
export const CategoryConnectionDocument = gql`
    query categoryConnection($before: String, $after: String, $first: Float, $last: Float, $sort: String, $filter: CategoryFilter) {
  categoryConnection(
    before: $before
    after: $after
    first: $first
    last: $last
    sort: $sort
    filter: $filter
  ) {
    pageInfo {
      hasPreviousPage
      hasNextPage
      startCursor
      endCursor
    }
    totalCount
    edges {
      cursor
      node {
        ... on Document {
          _sys {
            filename
            basename
            breadcrumbs
            path
            relativePath
            extension
          }
          id
        }
        ...CategoryParts
      }
    }
  }
}
    ${CategoryPartsFragmentDoc}`;
export function getSdk(requester) {
  return {
    page(variables, options) {
      return requester(PageDocument, variables, options);
    },
    pageConnection(variables, options) {
      return requester(PageConnectionDocument, variables, options);
    },
    blog(variables, options) {
      return requester(BlogDocument, variables, options);
    },
    blogConnection(variables, options) {
      return requester(BlogConnectionDocument, variables, options);
    },
    archive(variables, options) {
      return requester(ArchiveDocument, variables, options);
    },
    archiveConnection(variables, options) {
      return requester(ArchiveConnectionDocument, variables, options);
    },
    category(variables, options) {
      return requester(CategoryDocument, variables, options);
    },
    categoryConnection(variables, options) {
      return requester(CategoryConnectionDocument, variables, options);
    }
  };
}
import { createClient } from "tinacms/dist/client";
const generateRequester = (client) => {
  const requester = async (doc, vars, _options) => {
    const data = await client.request({
      query: doc,
      variables: vars
    });
    return { data: data?.data, query: doc, variables: vars || {} };
  };
  return requester;
};
export const ExperimentalGetTinaClient = () => getSdk(
  generateRequester(createClient({ url: "http://localhost:4001/graphql", queries }))
);
export const queries = (client) => {
  const requester = generateRequester(client);
  return getSdk(requester);
};
