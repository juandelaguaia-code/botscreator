import type { z } from "zod";

/** Lee y valida el cuerpo JSON; `null` si no es JSON o no cumple el esquema. */
export async function readJson<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<z.infer<T> | null> {
  try {
    const parsed = schema.safeParse(await req.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
