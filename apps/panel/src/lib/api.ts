import type {
  AgencyClientDto,
  AgencyClientInput,
  AgencyLeadDto,
  AppointmentDto,
  AuditEntryDto,
  AutomationReportDto,
  BusinessProfile,
  CampaignDto,
  CampaignInput,
  Channel,
  ConnectionsDto,
  ConversationDetailDto,
  ConversationFilter,
  ConversationListItemDto,
  CostsDto,
  GalleryItemDto,
  GiroDto,
  InsightsDto,
  KbDocumentDetailDto,
  KbDocumentDto,
  KbSearchResultDto,
  KnowledgeEngineDto,
  KnowledgeGapDto,
  LeadDto,
  LeadStatus,
  MessageDto,
  PaymentDto,
  PlaygroundReplyDto,
  PromptPreviewDto,
  PromptVersionDto,
  SessionDto,
  SettingsDto,
  SettingsUpdate,
  StatsDto,
  SummaryDto,
  TeamUserDto,
  TicketDto,
  UserRole,
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
    headers: {
      ...(init.body && !(init.body instanceof FormData)
        ? { "content-type": "application/json" }
        : {}),
      ...init.headers,
    },
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
  session: () => request<SessionDto>("/session"),
  login: (password: string, email?: string) =>
    post<{ ok: true }>("/login", email ? { email, password } : { password }),
  forgot: (email: string) => post<{ ok: true }>("/forgot", { email }),
  accessInfo: (token: string) =>
    request<{ valid: boolean; kind?: "invite" | "reset"; name?: string; email?: string }>(
      `/access/${token}`,
    ),
  accessAccept: (
    token: string,
    input: { password: string; whatsapp?: string; position?: string },
  ) => post<{ ok: true }>(`/access/${token}`, input),

  team: () => request<{ users: TeamUserDto[]; teamSections: string[] }>("/team"),
  teamInvite: (input: { name: string; email: string; role: UserRole }) =>
    post<{ user: TeamUserDto; link: string }>("/team/invites", input),
  teamLink: (id: string) =>
    post<{ link: string; kind: "invite" | "reset" }>(`/team/users/${id}/link`),
  teamUpdate: (id: string, patch: { role?: UserRole; status?: "active" | "disabled" }) =>
    request<{ user: TeamUserDto }>(`/team/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  teamRemove: (id: string) => request<{ ok: true }>(`/team/users/${id}`, { method: "DELETE" }),
  teamSections: (sections: string[]) =>
    request<{ teamSections: string[] }>("/team/sections", {
      method: "PUT",
      body: JSON.stringify({ sections }),
    }),
  teamAudit: () => request<{ entries: AuditEntryDto[] }>("/team/audit"),
  assignees: () => request<{ users: Array<{ id: string; name: string }> }>("/assignees"),
  assign: (conversationId: string, userId: string | null) =>
    post<{ ok: true }>(`/conversations/${conversationId}/assign`, { userId }),
  uploadLogo: (form: FormData) =>
    request<{ logoUrl: string }>("/branding/logo", { method: "POST", body: form }),
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
  connections: () => request<ConnectionsDto>("/connections"),

  stats: (days: number) => request<StatsDto>(`/stats?days=${days}`),
  costs: () => request<CostsDto>("/costs"),
  insights: (filter: "all" | "upset" | "open_sale" | "low") =>
    request<InsightsDto>(`/insights?filter=${filter}`),
  runAutomation: () => post<AutomationReportDto>("/automation/run"),

  appointments: () => request<{ appointments: AppointmentDto[] }>("/appointments"),
  payments: () => request<{ payments: PaymentDto[] }>("/payments"),

  gallery: () => request<{ items: GalleryItemDto[]; storage: boolean }>("/gallery"),
  galleryUpload: (form: FormData) =>
    request<{ item: GalleryItemDto }>("/gallery", { method: "POST", body: form }),
  galleryDelete: (id: string) => request<{ ok: true }>(`/gallery/${id}`, { method: "DELETE" }),

  campaigns: () => request<{ campaigns: CampaignDto[] }>("/campaigns"),
  campaignCreate: (input: CampaignInput) => post<{ id: string }>("/campaigns", input),
  campaignSend: (id: string) => post<{ ok: true; sent: number }>(`/campaigns/${id}/send`),

  agencyClients: () => request<{ clients: AgencyClientDto[] }>("/agency/clients"),
  agencyAdd: (input: AgencyClientInput) =>
    post<{ client: AgencyClientDto }>("/agency/clients", input),
  agencyRemove: (id: string) =>
    request<{ ok: true }>(`/agency/clients/${id}`, { method: "DELETE" }),
  prompt: (channel: Channel) => request<PromptPreviewDto>(`/prompt?channel=${channel}`),
  promptVersions: () => request<{ versions: PromptVersionDto[] }>("/prompt/versions"),
  promptSaveVersion: (label: string) => post<{ ok: true }>("/prompt/versions", { label }),
  promptRestore: (id: string) =>
    post<{ profile: BusinessProfile }>(`/prompt/versions/${id}/restore`),
  giros: () => request<{ giros: GiroDto[] }>("/giros"),
  giroApply: (giro: string) =>
    post<{ profile: BusinessProfile; pendingQuestions: string[] }>("/giro/apply", { giro }),

  agencyLeads: () => request<{ leads: AgencyLeadDto[]; failed: string[] }>("/agency/leads"),
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
