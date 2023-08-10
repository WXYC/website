// tina/config.js
import { defineConfig, defineSchema } from "tinacms";

// tina/collections/page.js
var page_default = {
  label: "Page Content",
  name: "page",
  path: "content/page",
  format: "mdx",
  fields: [
    {
      name: "body",
      label: "Main Content",
      type: "rich-text",
      isBody: true,
      templates: [
        {
          name: "photoGallery",
          label: "Photo Gallery",
          fields: [
            {
              name: "photos",
              label: "Photos",
              type: "image",
              list: true
            }
          ]
        }
      ]
    }
  ],
  ui: {
    router: ({ document }) => {
      if (document._sys.filename === "home") {
        return `/`;
      }
      return void 0;
    }
  }
};

// tina/collections/blog.js
import { wrapFieldsWithMeta } from "tinacms";
var blog_default = {
  label: "Blog Posts",
  name: "blog",
  path: "content/blog",
  format: "md",
  ui: {
    filename: {
      // if disabled, the editor can not edit the filename
      readonly: true,
      // Example of using a custom slugify function
      slugify: (values) => {
        return `${values?.title?.toLowerCase().replace(/[^\w\s]/gi, "").replace(/\s+/g, "-")}`;
      }
    }
  },
  fields: [
    {
      type: "string",
      label: "Title",
      name: "title",
      placeholder: "post title"
    },
    {
      type: "string",
      label: "Author",
      name: "author",
      placeholder: "post author"
    },
    {
      name: "cover",
      type: "image",
      label: "Cover Image"
    },
    {
      type: "object",
      list: true,
      name: "categories",
      label: "Categories",
      fields: [
        {
          type: "reference",
          label: "Category",
          name: "category",
          collections: ["category"]
        }
      ]
    },
    {
      type: "datetime",
      label: "Published",
      name: "published"
    },
    {
      type: "string",
      label: "Post Description",
      name: "description",
      placeholder: "post description"
    },
    {
      type: "rich-text",
      label: "Blog Post Body",
      name: "body",
      placeholder: "post body",
      isBody: true
      // ui: {
      //   component: "textarea",
      // },
    }
  ]
  // ui: {
  //   router: ({ document }) => {
  //     return `/blog/${document._sys.filename}`;
  //   },
  // },
};

// tina/collections/archive.js
var archive_default = {
  label: "Archive",
  name: "archive",
  path: "content/archive",
  format: "md",
  ui: {
    filename: {
      // if disabled, the editor can not edit the filename
      readonly: true,
      // Example of using a custom slugify function
      slugify: (values) => {
        return `${values?.title?.toLowerCase().replace(/[^\w\s]/gi, "").replace(/\s+/g, "-")}`;
      }
    }
  },
  fields: [
    {
      type: "string",
      label: "Title",
      name: "title"
    },
    {
      name: "cover",
      type: "image",
      label: "Cover Image"
    },
    {
      type: "object",
      list: true,
      name: "categories",
      label: "Categories",
      fields: [
        {
          type: "reference",
          label: "Category",
          name: "category",
          collections: ["category"]
        }
      ]
    },
    {
      type: "datetime",
      label: "Published",
      name: "published"
    },
    {
      type: "rich-text",
      label: "Post Description",
      name: "description",
      isBody: true
    }
  ]
};

// tina/collections/category.js
var category_default = {
  label: "Category",
  name: "category",
  path: "content/category",
  format: "md",
  fields: [
    {
      type: "string",
      label: "Title",
      name: "title"
    },
    {
      type: "boolean",
      label: "Specialty Show",
      name: "specialtyShow"
    },
    {
      type: "string",
      label: "Category Description",
      name: "description",
      placeholder: "Optional description"
    }
  ],
  ui: {
    filename: {
      // if disabled, the editor can not edit the filename
      readonly: true,
      // Example of using a custom slugify function
      slugify: (values) => {
        return `${values?.title?.toLowerCase().replace(/[^\w\s]/gi, "").replace(/\s+/g, "-")}`;
      }
    }
  }
};

// tina/config.js
var schema = defineSchema({
  collections: [
    page_default,
    blog_default,
    archive_default,
    category_default
  ]
});
var config = defineConfig({
  clientId: process.env.TINA_PUBLIC_CLIENT_ID,
  branch: "main",
  token: process.env.TINA_TOKEN,
  media: {
    tina: {
      publicFolder: "public",
      mediaRoot: "uploads"
    }
  },
  search: {
    tina: {
      indexerToken: process.env.SEARCH_TOKEN,
      stopwordLanguages: ["eng"]
    },
    indexBatchSize: 100,
    maxSearchIndexFieldLength: 100
  },
  build: {
    publicFolder: "public",
    outputFolder: "admin",
    basePath: "website"
  },
  schema
});
var config_default = config;
export {
  config,
  config_default as default
};
