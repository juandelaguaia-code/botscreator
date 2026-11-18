import type { ImageMediaType } from "@yunque/llm";
import type { MediaRef } from "./types.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES: ImageMediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/** Convierte audio en texto. Producción: Whisper en Workers AI. */
export interface Transcriber {
  transcribe(audio: ArrayBuffer, mimeType: string): Promise<string>;
}

export class WorkersAiTranscriber implements Transcriber {
  constructor(private readonly ai: Ai) {}

  async transcribe(audio: ArrayBuffer): Promise<string> {
    const res = (await this.ai.run("@cf/openai/whisper-large-v3-turbo", {
      audio: toBase64(audio),
    })) as { text?: string };
    return (res.text ?? "").trim();
  }
}

export function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export interface ProcessedMedia {
  /** Texto agregado al mensaje (transcripciones). */
  extraText: string[];
  images: Array<{ mediaType: ImageMediaType; data: string }>;
  /** Medios que no se pudieron entender (para responder con honestidad). */
  unsupported: number;
}

/**
 * Oído y vista: transcribe notas de voz y prepara imágenes para el modelo. Lo que falla o no se
 * soporta se cuenta, nunca se inventa.
 */
export async function processMedia(
  media: MediaRef[] | undefined,
  transcriber: Transcriber | null,
): Promise<ProcessedMedia> {
  const out: ProcessedMedia = { extraText: [], images: [], unsupported: 0 };
  for (const ref of media ?? []) {
    try {
      if (ref.kind === "audio") {
        if (!transcriber) {
          out.unsupported++;
          continue;
        }
        const { data, mimeType } = await ref.download();
        if (data.byteLength > MAX_AUDIO_BYTES) {
          out.unsupported++;
          continue;
        }
        const text = await transcriber.transcribe(data, mimeType);
        if (text) out.extraText.push(`[Nota de voz transcrita] ${text}`);
        else out.unsupported++;
      } else if (ref.kind === "image") {
        const { data, mimeType } = await ref.download();
        const type = mimeType.split(";")[0]?.trim() as ImageMediaType;
        if (!IMAGE_TYPES.includes(type) || data.byteLength > MAX_IMAGE_BYTES) {
          out.unsupported++;
          continue;
        }
        out.images.push({ mediaType: type, data: toBase64(data) });
      } else {
        out.unsupported++;
      }
    } catch {
      out.unsupported++;
    }
  }
  return out;
}
