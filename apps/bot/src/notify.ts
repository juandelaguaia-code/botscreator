import { sendTelegramMessage } from "./channels/telegram.js";
import type { Env } from "./env.js";

export interface OwnerNotice {
  /** Título corto (asunto del correo). */
  title: string;
  body: string;
  /** Ruta del panel para ver el detalle, p. ej. /admin/bandeja/cv_123 */
  path?: string;
}

/** Avisos al dueño: Telegram y/o correo, según lo que esté configurado. */
export interface Notifier {
  notify(notice: OwnerNotice): Promise<void>;
  readonly channels: string[];
}

export function createNotifier(env: Env): Notifier {
  const channels: string[] = [];
  if (env.TELEGRAM_BOT_TOKEN && env.OWNER_TELEGRAM_CHAT_ID) channels.push("telegram");
  if (env.RESEND_API_KEY && env.OWNER_EMAIL && env.EMAIL_FROM) channels.push("email");
  const base = env.PUBLIC_URL?.replace(/\/$/, "") ?? "";

  return {
    channels,
    async notify(notice) {
      const link = notice.path && base ? `${base}${notice.path}` : "";
      const tasks: Promise<unknown>[] = [];
      if (channels.includes("telegram")) {
        tasks.push(
          sendTelegramMessage(
            env.TELEGRAM_BOT_TOKEN as string,
            env.OWNER_TELEGRAM_CHAT_ID as string,
            [notice.title, notice.body, link].filter(Boolean).join("\n"),
          ),
        );
      }
      if (channels.includes("email")) {
        tasks.push(
          fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              authorization: `Bearer ${env.RESEND_API_KEY}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              from: env.EMAIL_FROM,
              to: [env.OWNER_EMAIL],
              subject: notice.title,
              text: [notice.body, link].filter(Boolean).join("\n\n"),
            }),
          }).then(async (res) => {
            if (!res.ok) throw new Error(`Resend respondió ${res.status}`);
          }),
        );
      }
      const results = await Promise.allSettled(tasks);
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length === results.length && failed.length > 0) {
        throw new Error("No se pudo avisar al dueño por ningún canal");
      }
    },
  };
}
