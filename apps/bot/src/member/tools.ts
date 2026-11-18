import type { Toolkit, ToolkitContext } from "../engine/engine.js";

/**
 * Herramientas propias del dueño (punto de extensión).
 *
 * Aquí se agregan capacidades a medida —consultar el estado de un pedido, calcular un envío, llamar
 * a la API de su sistema— sin tocar el motor. Devuelve `null` si no hay herramientas.
 *
 * Ejemplo:
 *   return {
 *     tools: [{ name: "estado_pedido", description: "Consulta un pedido por su número",
 *               inputSchema: { type: "object", properties: { numero: { type: "string" } }, required: ["numero"] } }],
 *     handlers: { estado_pedido: async (input) => ({ content: await consultarPedido(String(input.numero)) }) },
 *     promptSection: { title: "Pedidos", text: "Usa estado_pedido cuando pregunten por un pedido." },
 *   };
 */
export function memberToolkit(_ctx: ToolkitContext): Toolkit | null {
  return null;
}
