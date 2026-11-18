---

name: exportar
description: Descarga los datos del bot — leads y conversaciones en CSV (Excel/Sheets) o JSON — como respaldo o para usarlos en otra herramienta. Solo lectura, sin candado. Úsala con "exporta mis leads", "descarga las conversaciones", "respaldo de datos".
---

# Exportar datos

Pregunta qué necesita (una pregunta) y corre uno o varios:

- `pnpm yunque exportar leads.csv` · `pnpm yunque exportar leads.json`
- `pnpm yunque exportar messages.csv` (un mensaje por fila) · `pnpm yunque exportar conversations.json` (hilos completos)

Los CSV traen BOM UTF-8 (Excel lee bien los acentos) y protección contra fórmulas. También se descargan desde
el panel: Clientes → Exportar. Recuerda al dueño que son datos personales de sus clientes: guárdalos en un
lugar seguro y no los compartas por chat.
