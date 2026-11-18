import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { Spinner } from "./components/ui.js";
import { api, UNAUTHORIZED_EVENT } from "./lib/api.js";
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
import { TicketsPage } from "./pages/Tickets.js";

type Session =
  | { status: "loading" }
  | { status: "anonymous"; botName: string; hasPassword: boolean }
  | { status: "ready"; botName: string };

export function App() {
  const [session, setSession] = useState<Session>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const s = await api.session();
      setSession(
        s.authenticated
          ? { status: "ready", botName: s.botName }
          : { status: "anonymous", botName: s.botName, hasPassword: s.hasPassword },
      );
    } catch {
      setSession({ status: "anonymous", botName: "", hasPassword: true });
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

  if (session.status === "anonymous") {
    return (
      <LoginPage botName={session.botName} hasPassword={session.hasPassword} onLoggedIn={refresh} />
    );
  }

  return (
    <Layout
      botName={session.botName}
      onLogout={async () => {
        await api.logout();
        await refresh();
      }}
    >
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
        <Route path="/agencia" element={<AgencyPage />} />
        <Route path="/prompt" element={<PromptPage />} />
        <Route path="/mejoras" element={<ImprovementsPage />} />
        <Route path="/probar" element={<PlaygroundPage />} />
        <Route path="/superpoderes" element={<SuperpowersPage />} />
        <Route path="/comandos" element={<CommandsPage />} />
        <Route path="/configuracion" element={<SettingsPage onSaved={refresh} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
