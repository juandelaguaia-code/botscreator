import type { Env } from "./env.js";
import type { Services } from "./services.js";

export interface AppEnv {
  Bindings: Env;
  Variables: { services: Services };
}
