const encoder = new TextEncoder();
/** Máximo que permite Workers para PBKDF2. */
const ITERATIONS = 100_000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    key,
    256,
  );
  return new Uint8Array(bits);
}

/** Hash de contraseña con PBKDF2-SHA256 y sal aleatoria de 16 bytes. */
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: toBase64(await derive(password, salt)), salt: toBase64(salt) };
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  const candidate = await derive(password, fromBase64(salt));
  const expected = fromBase64(hash);
  if (candidate.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= (candidate[i] ?? 0) ^ (expected[i] ?? 0);
  return diff === 0;
}

/** Token aleatorio para links de un solo uso (se entrega una vez; se guarda solo su hash). */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}
