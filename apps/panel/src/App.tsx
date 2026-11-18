import type { SessionDto } from "@yunque/core";
import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { EmptyState, Spinner } from "./components/ui.js";
import { api, UNAUTHORIZED_EVENT } from "./lib/api.js";
import { applyBranding } from "./lib/branding.js";
import { AccessPage } from "./pages/Access.js";
import { AgencyPage } from "./pages/Agency.js";
import { CampaignsPage, GalleryPage, SalesPage } from "./pages/Business.js";
import { CommandsPage } from "./pages/Commands.js";
import { ConnectionsPage } from "./pages/Connections.js";
import { AnalystPage, CostsPage, StatsPage } from "./pages/Growth.js";
import { ImprovementsPage } from "./pages/Improvements.js";
import { InboxPage } from "./pages/Inbox.js";
import { KnowledgePage } from "./pages/Knowledge.js";
import { LeadsPage } from "./pages/Leads.js";
import { LoginPage } from "./pages/Login.js";
import { PlaygroundPage } from "./pages/Playground.js";
import { PromptPage } from "./pages/Prompt.js";
import { SettingsPage } from "./pages/Settings.js";
import { SummaryPage } from "./pages/Summary.js";
import { SuperpowersPage } from "./pages/Superpowers.js";
import { TeamPage } from "./pages/Team.js";
import { TicketsPage } from "./pages/Tickets.js";

type Session = { status: "loading" } | { status: "loaded"; data: SessionDto | null };

/** Pestaña a la que pertenece una ruta (`/bandeja/abc` → `/bandeja`). */
function tabOf(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0];
  return first ? `/${first}` : "/";
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const data = await api.session();
      applyBranding(data.branding, data.botName);
      setSession({ status: "loaded", data });
    } catch {
      setSession({ status: "loaded", data: null });
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onUnauthorized = () => void refresh();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [refresh]);

  if (session.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // invitación o recuperación de contraseña: pública, antes del login
  const accessToken = location.pathname.match(/^\/acceso\/([\w-]+)$/)?.[1];
  if (accessToken) {
    return (
      <AccessPage
        token={accessToken}
        onDone={() => {
          navigate("/", { replace: true });
          void refresh();
        }}
      />
    );
  }

  const s = session.data;
  if (!s?.authenticated) {
    return (
      <LoginPage
        botName={s?.botName ?? ""}
        hasPassword={s?.hasPassword ?? true}
        branding={s?.branding ?? null}
        onLoggedIn={refresh}
      />
    );
  }

  const allowed = s.allowedTabs;
  const tab = tabOf(location.pathname);
  const blocked = allowed !== null && !allowed.includes(tab);

  return (
    <Layout
      botName={s.botName}
      logoUrl={s.branding.logoUrl || null}
      allowedTabs={allowed}
      actor={s.actor}
      onLogout={async () => {
        await api.logout();
        await refresh();
      }}
    >
      {blocked ? (
        allowed.length > 0 ? (
          <Navigate to={allowed[0] ?? "/"} replace />
        ) : (
          <EmptyState title="Tu acceso todavía no tiene secciones">
            Pídele al Administrador del panel que te habilite al menos una sección en Equipo.
          </EmptyState>
        )
      ) : (
        <Routes>
          <Route path="/" element={<SummaryPage />} />
          <Route path="/bandeja" element={<InboxPage />} />
          <Route path="/bandeja/:id" element={<InboxPage />} />
          <Route path="/clientes" element={<LeadsPage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/conocimiento" element={<KnowledgePage />} />
          <Route path="/conexiones" element={<ConnectionsPage />} />
          <Route path="/analista" element={<AnalystPage />} />
          <Route path="/estadisticas" element={<StatsPage />} />
          <Route path="/costos" element={<CostsPage />} />
          <Route path="/campanas" element={<CampaignsPage />} />
          <Route path="/galeria" element={<GalleryPage />} />
          <Route path="/agenda" element={<SalesPage />} />
          <Route
            path="/agencia"
            element={<AgencyPage access={s.agencyAccess} isOwner={s.actor?.role === "owner"} />}
          />
          <Route path="/prompt" element={<PromptPage />} />
          <Route path="/mejoras" element={<ImprovementsPage />} />
          <Route path="/probar" element={<PlaygroundPage />} />
          <Route path="/superpoderes" element={<SuperpowersPage />} />
          <Route path="/comandos" element={<CommandsPage />} />
          <Route path="/equipo" element={<TeamPage />} />
          <Route path="/configuracion" element={<SettingsPage onSaved={refresh} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </Layout>
  );
}
