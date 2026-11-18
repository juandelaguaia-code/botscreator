import type { Env } from "./env.js";
import type { Services } from "./services.js";

/** Quién hace la petición: el dueño (contraseña maestra o token de agencia) o un usuario del equipo. */
export interface Actor {
  id: string;
  name: string;
  role: "owner" | "admin" | "team";
  /** Permiso sobre Modo agencia de un acceso personal (equipo de agencia). */
  agencyAccess?: "edit" | "read" | null;
}

export interface AppEnv {
  Bindings: Env;
  Variables: { services: Services; actor?: Actor };
}
