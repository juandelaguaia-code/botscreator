const encoder = new TextEncoder();

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Comparación en tiempo constante para no filtrar información por tiempos de respuesta. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface SessionPayload {
  sub: string;
  exp: number;
  /** owner (contraseña maestra) · admin · team */
  role?: string;
  /** Huella de la contraseña del usuario: si cambia, la sesión deja de valer. */
  h?: string;
}

/** Token de sesión firmado: `payload.firma`, ambos en base64url. */
export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body)),
  );
  return `${body}.${toBase64Url(sig)}`;
}

export async function verifySession(
  token: string,
  secret: string,
  now: number,
): Promise<SessionPayload | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromBase64Url(sig),
      encoder.encode(body),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

/** HMAC en hexadecimal o base64 (firmas de webhooks de Meta, Twilio y Stripe). */
export async function hmac(
  algorithm: "SHA-256" | "SHA-1",
  secret: string,
  data: string,
  encoding: "hex" | "base64",
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
  if (encoding === "hex") return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
  let binary = "";
  for (const b of sig) binary += String.fromCharCode(b);
  return btoa(binary);
}
