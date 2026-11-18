import type { AutomationReportDto } from "@yunque/core";
import { Hono } from "hono";
import { runAutomation } from "../automation/runner.js";
import { AnalyticsStore } from "../store/analytics.js";
import type { AppEnv } from "../types.js";

/** Estadísticas, Costos, Analista y la corrida manual de los superpoderes automáticos. */
export const analyticsApi = new Hono<AppEnv>();

analyticsApi.get("/stats", async (c) => {
  const days = Math.min(90, Math.max(7, Number(c.req.query("days") ?? 30) || 30));
  return c.json(await new AnalyticsStore(c.env.DB).stats(days, Date.now()));
});

analyticsApi.get("/costs", async (c) => {
  const { settings } = await c.get("services").config();
  return c.json(await new AnalyticsStore(c.env.DB).costs(Date.now(), settings.monthlyBudgetUsd));
});

analyticsApi.get("/insights", async (c) => {
  const f = c.req.query("filter");
  const filter = f === "upset" || f === "open_sale" || f === "low" ? f : "all";
  return c.json(await new AnalyticsStore(c.env.DB).insights(filter, 200));
});

/** Corre ahora lo que el cron hace cada 15 minutos (útil para probar y para el CLI). */
analyticsApi.post("/automation/run", async (c) => {
  const report: AutomationReportDto = await runAutomation(c.get("services"));
  return c.json(report);
});
