import type { Env } from "./env.js";
import type { Services } from "./services.js";

/** Quién hace la petición: el dueño (contraseña maestra o token de agencia) o un usuario del equipo. */
export interface Actor {
  id: string;
  name: string;
  role: "owner" | "admin" | "team";
}

export interface AppEnv {
  Bindings: Env;
  Variables: { services: Services; actor?: Actor };
}
