import { describe, expect, it } from "vitest";
import {
  costUsd,
  createProvider,
  FakeProvider,
  type GenerateRequest,
  LlmError,
  type LlmMessage,
  runToolLoop,
  toAnthropicMessages,
  toOpenAIMessages,
} from "../src/index.js";

const baseRequest: GenerateRequest = {
  system: { stable: "Eres un asistente." },
  messages: [
    { role: "user", content: [{ type: "text", text: "Hola, mi correo es ana@example.com" }] },
  ],
  tools: [
    {
      name: "capturar_lead",
      description: "Registra un lead",
      inputSchema: { type: "object", properties: { email: { type: "string" } } },
    },
  ],
  tier: "fast",
};

describe("runToolLoop", () => {
  it("ejecuta la herramienta pedida y devuelve el resultado al modelo", async () => {
    const provider = new FakeProvider();
    const seen: Record<string, unknown>[] = [];
    const result = await runToolLoop({
      provider,
      request: baseRequest,
      handlers: {
        capturar_lead: async (input) => {
          seen.push(input);
          return { content: "ok" };
        },
      },
    });

    expect(seen).toEqual([expect.objectContaining({ email: "ana@example.com" })]);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.responses).toHaveLength(2);
    expect(result.text).toContain("Ya quedó registrado");
    // el segundo llamado incluye la llamada y su resultado
    const second = provider.calls[1];
    expect(second?.messages.at(-1)?.content[0]).toMatchObject({
      type: "tool_result",
      content: "ok",
    });
  });

  it("marca como error una herramienta desconocida sin romper el turno", async () => {
    const provider = new FakeProvider((_req, i) =>
      i === 0
        ? [{ type: "tool_call", id: "x", name: "no_existe", input: {} }]
        : [{ type: "text", text: "fin" }],
    );
    const result = await runToolLoop({ provider, request: baseRequest, handlers: {} });
    expect(result.toolCalls[0]?.result.isError).toBe(true);
    expect(result.text).toBe("fin");
  });

  it("corta tras el máximo de iteraciones", async () => {
    const provider = new FakeProvider((_req, i) => [
      { type: "tool_call", id: `c${i}`, name: "loop", input: {} },
    ]);
    const result = await runToolLoop({
      provider,
      request: baseRequest,
      handlers: { loop: async () => ({ content: "otra vez" }) },
      maxIterations: 3,
    });
    expect(provider.calls).toHaveLength(3);
    expect(result.final.stopReason).toBe("tool_use");
  });
});

describe("mapeo de mensajes", () => {
  const history: LlmMessage[] = [
    { role: "user", content: [{ type: "text", text: "hola" }] },
    {
      role: "assistant",
      content: [
        {
          type: "provider_raw",
          provider: "anthropic",
          block: { type: "thinking", thinking: "", signature: "sig" },
        },
        { type: "text", text: "Te registro" },
        { type: "tool_call", id: "t1", name: "capturar_lead", input: { email: "a@b.co" } },
      ],
    },
    { role: "user", content: [{ type: "tool_result", toolCallId: "t1", content: "ok" }] },
  ];

  it("Anthropic conserva los bloques propios y los tool_use/tool_result", () => {
    const out = toAnthropicMessages(history);
    expect(out[1]?.content).toEqual([
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: "Te registro" },
      { type: "tool_use", id: "t1", name: "capturar_lead", input: { email: "a@b.co" } },
    ]);
    expect(out[2]?.content).toEqual([{ type: "tool_result", tool_use_id: "t1", content: "ok" }]);
  });

  it("OpenAI descarta bloques ajenos y separa los resultados en mensajes tool", () => {
    const out = toOpenAIMessages(history);
    expect(out[1]).toMatchObject({
      role: "assistant",
      content: "Te registro",
      tool_calls: [{ id: "t1", type: "function", function: { name: "capturar_lead" } }],
    });
    expect(out[2]).toEqual({ role: "tool", tool_call_id: "t1", content: "ok" });
  });
});

describe("createProvider", () => {
  it("exige la llave del proveedor elegido", () => {
    expect(() => createProvider("anthropic", {})).toThrow(LlmError);
    expect(createProvider("fake", {}).id).toBe("fake");
    expect(createProvider("anthropic", { anthropic: "sk-test" }).modelFor("fast")).toBe(
      "claude-haiku-5-5",
    );
    expect(createProvider("xai", { xai: "k" }, { fast: "grok-custom" }).modelFor("fast")).toBe(
      "grok-custom",
    );
  });
});

describe("costUsd", () => {
  it("calcula por millón de tokens y tolera sufijos de versión", () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    expect(costUsd("claude-sonnet-5-5", usage)).toBeCloseTo(12);
    expect(costUsd("gpt-4.1-mini-2025-04-14", usage)).toBeCloseTo(2);
    expect(costUsd("modelo-desconocido", usage)).toBe(0);
  });
});
