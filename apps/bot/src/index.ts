import { createApp } from "./app.js";
import { runAutomation } from "./automation/runner.js";
import type { Env } from "./env.js";
import { createServices } from "./services.js";

const app = createApp();

export default {
  fetch: app.fetch,
  /** Cron cada 15 min: Vigilante, Cazador, encuestas, reseñas, no-shows, reporte nocturno y watchdog. */
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runAutomation(createServices(env)).then((report) => {
        console.log(JSON.stringify({ message: "automation", ...report }));
      }),
    );
  },
} satisfies ExportedHandler<Env>;
