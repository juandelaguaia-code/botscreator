import type {
  ConversationDetailDto,
  ConversationFilter,
  ConversationListItemDto,
  KbDocumentDetailDto,
  KbDocumentDto,
  KbSearchResultDto,
  KnowledgeEngineDto,
  KnowledgeGapDto,
  LeadDto,
  LeadStatus,
  MessageDto,
  PlaygroundReplyDto,
  SettingsDto,
  SettingsUpdate,
  SummaryDto,
  TicketDto,
} from "@yunque/core";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Se dispara cuando la sesión vence, para que la app vuelva al login. */
export const UNAUTHORIZED_EVENT = "panel:unauthorized";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/admin/api${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/login"))
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(body.error ?? `Error ${res.status}`, res.status);
  }
  return body as T;
}

const post = <T>(path: string, data: unknown = {}) =>
  request<T>(path, { method: "POST", body: JSON.stringify(data) });

export const api = {
  session: () =>
    request<{ authenticated: boolean; botName: string; hasPassword: boolean }>("/session"),
  login: (password: string) => post<{ ok: true }>("/login", { password }),
  logout: () => post<{ ok: true }>("/logout"),

  summary: () => request<SummaryDto>("/summary"),

  conversations: (filter: ConversationFilter, q: string) =>
    request<{ conversations: ConversationListItemDto[] }>(
      `/conversations?filter=${filter}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    ),
  conversation: (id: string) => request<ConversationDetailDto>(`/conversations/${id}`),
  reply: (id: string, text: string) =>
    post<{ message: MessageDto; delivered: boolean; deliveryError: string | null }>(
      `/conversations/${id}/reply`,
      { text },
    ),
  note: (id: string, text: string) =>
    post<{ message: MessageDto }>(`/conversations/${id}/note`, { text }),
  pause: (id: string, minutes: number | null) =>
    post<{ pausedUntil: number }>(`/conversations/${id}/pause`, { minutes }),
  resume: (id: string) => post<{ ok: true }>(`/conversations/${id}/resume`),

  leads: () => request<{ leads: LeadDto[] }>("/leads"),
  updateLead: (id: string, patch: { status?: LeadStatus; notes?: string }) =>
    request<{ lead: LeadDto }>(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  tickets: (status: "open" | "resolved" | "all") =>
    request<{ tickets: TicketDto[] }>(`/tickets?status=${status}`),
  resolveTicket: (id: string) => post<{ ok: true }>(`/tickets/${id}/resolve`),

  settings: () => request<SettingsDto>("/settings"),
  saveSettings: (update: SettingsUpdate) =>
    request<SettingsDto>("/settings", { method: "PUT", body: JSON.stringify(update) }),

  playground: (sessionId: string, text: string) =>
    post<PlaygroundReplyDto>("/playground", { sessionId, text }),

  kb: () => request<{ engine: KnowledgeEngineDto; documents: KbDocumentDto[] }>("/kb"),
  kbDocument: (id: string) => request<KbDocumentDetailDto>(`/kb/documents/${id}`),
  kbCreate: (title: string, content: string) =>
    post<{ document: KbDocumentDto }>("/kb/documents", { title, content }),
  kbUpdate: (id: string, title: string, content: string) =>
    request<{ document: KbDocumentDto }>(`/kb/documents/${id}`, {
      method: "PUT",
      body: JSON.stringify({ title, content }),
    }),
  kbDelete: (id: string) => request<{ ok: true }>(`/kb/documents/${id}`, { method: "DELETE" }),
  kbImportUrl: (url: string) => post<{ document: KbDocumentDto }>("/kb/import-url", { url }),
  kbSearch: (query: string) => post<KbSearchResultDto>("/kb/search", { query }),
  kbReindex: () => post<{ documents: number; errors: number }>("/kb/reindex"),

  gaps: (status: "open" | "resolved" | "ignored") =>
    request<{ gaps: KnowledgeGapDto[] }>(`/gaps?status=${status}&days=30`),
  resolveGap: (id: string, answer?: string) =>
    post<{ ok: true }>(`/gaps/${id}/resolve`, answer ? { answer } : {}),
  ignoreGap: (id: string) => post<{ ok: true }>(`/gaps/${id}/ignore`),
};

/** Descargas: la cookie de sesión viaja sola porque son rutas bajo /admin. */
export const EXPORTS = [
  { href: "/admin/api/export/leads.csv", label: "Leads (CSV)" },
  { href: "/admin/api/export/leads.json", label: "Leads (JSON)" },
  { href: "/admin/api/export/messages.csv", label: "Mensajes (CSV)" },
  { href: "/admin/api/export/conversations.json", label: "Conversaciones (JSON)" },
] as const;
