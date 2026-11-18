import type { AgencyAccess, TeamUserDto } from "@yunque/core";
import { useState } from "react";
import { api } from "../lib/api.js";
import { useApi } from "../lib/hooks.js";
import { Button, Card, ErrorNote, Select } from "./ui.js";

const ACCESS_LABEL: Record<AgencyAccess, string> = { edit: "Puede editar", read: "Solo lectura" };

/** Equipo de agencia: el dueño elige hasta 3 accesos personales que entran a Modo agencia. */
export function AgencyTeam() {
  const { data, reload } = useApi(() => api.agencyCollaborators(), "agency-team");
  const [pick, setPick] = useState("");
  const [access, setAccess] = useState<AgencyAccess>("read");
  const [error, setError] = useState<string | null>(null);

  async function set(user: TeamUserDto | string, value: AgencyAccess | null) {
    setError(null);
    try {
      await api.agencySetAccess(typeof user === "string" ? user : user.id, value);
      setPick("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  if (!data) return null;
  const full = data.collaborators.length >= data.max;

  return (
    <Card className="mt-6 p-5">
      <h2 className="font-semibold">Equipo de agencia</h2>
      <p className="mt-1 text-sm text-slate-500">
        Hasta {data.max} personas de tu equipo pueden entrar a Modo agencia: con permiso para editar
        (agregar y quitar bots) o solo para mirar. Nadie más lo ve. Las personas se invitan en
        Equipo.
      </p>
      {data.collaborators.length ? (
        <ul className="mt-4 divide-y divide-slate-100">
          {data.collaborators.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="min-w-0 flex-1 basis-48 truncate text-sm">
                <span className="font-medium">{u.name}</span>{" "}
                <span className="text-slate-500">· {u.email}</span>
              </span>
              <Select
                aria-label={`Permiso de ${u.name}`}
                className="w-40"
                value={u.agencyAccess ?? "read"}
                onChange={(e) => void set(u, e.target.value as AgencyAccess)}
              >
                <option value="edit">{ACCESS_LABEL.edit}</option>
                <option value="read">{ACCESS_LABEL.read}</option>
              </Select>
              <Button variant="ghost" onClick={() => void set(u, null)}>
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {full ? (
        <p className="mt-3 text-xs text-slate-500">Llegaste al máximo de colaboradores.</p>
      ) : data.candidates.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Select
            aria-label="Persona"
            className="w-56"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">Elige a alguien…</option>
            {data.candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Permiso"
            className="w-40"
            value={access}
            onChange={(e) => setAccess(e.target.value as AgencyAccess)}
          >
            <option value="read">{ACCESS_LABEL.read}</option>
            <option value="edit">{ACCESS_LABEL.edit}</option>
          </Select>
          <Button disabled={!pick} onClick={() => void set(pick, access)}>
            Sumar al equipo
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          No hay accesos activos para sumar. Invita a alguien desde Equipo.
        </p>
      )}
      <div className="mt-3">
        <ErrorNote message={error} />
      </div>
    </Card>
  );
}
