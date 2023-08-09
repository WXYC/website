import { createClient } from "tinacms/dist/client";
import { queries } from "./types";
export const client = createClient({ url: `https://content.tinajs.io/1.4/content/${process.env.TINA_PUBLIC_CLIENT_ID}/github/${process.env.NEXT_PUBLIC_TINA_BRANCH}`, token: process.env.TINA_TOKEN, queries });
export default client;
  