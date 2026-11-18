import type {
  GenerateRequest,
  GenerateResponse,
  LlmMessage,
  LlmPart,
  LlmProvider,
} from "./types.js";

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

export interface ToolCallRecord {
  name: string;
  input: Record<string, unknown>;
  result: ToolResult;
}

export interface ToolLoopResult {
  final: GenerateResponse;
  /** Todas las respuestas del modelo en este turno (para registrar uso y costo). */
  responses: GenerateResponse[];
  toolCalls: ToolCallRecord[];
  /** Texto final para el cliente: lo que el modelo dijo a lo largo del turno. */
  text: string;
}

export interface RunToolLoopOptions {
  provider: LlmProvider;
  request: GenerateRequest;
  handlers: Record<string, ToolHandler>;
  /** Máximo de idas y vueltas con herramientas antes de cortar. */
  maxIterations?: number;
}

/**
 * Bucle de herramientas: llama al modelo, ejecuta las herramientas que pida (en paralelo) y
 * devuelve todos los resultados en un solo mensaje, hasta que el modelo termina.
 */
export async function runToolLoop({
  provider,
  request,
  handlers,
  maxIterations = 4,
}: RunToolLoopOptions): Promise<ToolLoopResult> {
  const messages: LlmMessage[] = [...request.messages];
  const responses: GenerateResponse[] = [];
  const toolCalls: ToolCallRecord[] = [];
  const texts: string[] = [];

  for (let i = 0; i < maxIterations; i++) {
    const response = await provider.generate({ ...request, messages });
    responses.push(response);
    if (response.text) texts.push(response.text);

    if (response.stopReason !== "tool_use" || response.toolCalls.length === 0) {
      return { final: response, responses, toolCalls, text: texts.join("\n\n").trim() };
    }

    messages.push({ role: "assistant", content: response.content });

    const results = await Promise.all(
      response.toolCalls.map(async (call): Promise<LlmPart> => {
        const handler = handlers[call.name];
        let result: ToolResult;
        if (!handler) {
          result = { content: `Herramienta desconocida: ${call.name}`, isError: true };
        } else {
          try {
            result = await handler(call.input);
          } catch (error) {
            result = {
              content: error instanceof Error ? error.message : "Error al ejecutar la herramienta",
              isError: true,
            };
          }
        }
        toolCalls.push({ name: call.name, input: call.input, result });
        return {
          type: "tool_result",
          toolCallId: call.id,
          content: result.content,
          ...(result.isError ? { isError: true } : {}),
        };
      }),
    );

    messages.push({ role: "user", content: results });
  }

  const final = responses.at(-1) as GenerateResponse;
  return { final, responses, toolCalls, text: texts.join("\n\n").trim() };
}
