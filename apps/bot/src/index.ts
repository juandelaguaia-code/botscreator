import { createApp } from "./app.js";

const app = createApp();

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<import("./env.js").Env>;
