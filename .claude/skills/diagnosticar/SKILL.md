---

name: diagnosticar
description: Encuentra por qué un bot no responde o falla — revisa el equipo, la sesión de Cloudflare, la salud del Worker, los secretos, las migraciones y los avisos del sistema — y propone el arreglo exacto. Úsala con "mi bot no contesta", "no funciona el bot", "diagnostica", "algo anda mal", "doctor".
---

# Diagnosticar un bot

1. `pnpm bot doctor <bot>` y lee cada ✗ y ! de arriba hacia abajo: el primero suele explicar los demás.
   | Síntoma                                | Arreglo                                                             |
   | -------------------------------------- | ------------------------------------------------------------------- |
   | Sin sesión de Cloudflare               | `pnpm --filter @yunque/bot exec wrangler login`                     |
   | Recursos sin crear                     | `pnpm bot instalar <bot>`                                           |
   | No responde                            | `pnpm bot actualizar <bot>`; si sigue, revisa los registros (abajo) |
   | Falta un secreto                       | `pnpm bot secreto <bot> <NOMBRE>` (lo escribe el dueño)             |
   | Migraciones pendientes / versión vieja | `/actualizar-bot`                                                   |
2. Si el Worker responde pero el bot no contesta en un canal:
   - `pnpm yunque tickets` y busca los de tipo `system` (llave de IA vencida, límite del proveedor, tope de gasto).
   - `pnpm yunque probar "hola"`: si aquí contesta, el problema es del canal → skill `conectar-canal`.
   - En Configuración, ¿el interruptor "Bot encendido" está activo? ¿La conversación quedó en pausa por un humano?
3. Registros en vivo (con el sí del dueño, no muestran secretos):
   `pnpm --filter @yunque/bot exec wrangler tail -c ../../.yunque/bots/<bot>/wrangler.jsonc`.
4. Explica la causa en una frase simple, aplica el arreglo con su sí y repite `pnpm bot doctor <bot>` hasta verlo en verde.
