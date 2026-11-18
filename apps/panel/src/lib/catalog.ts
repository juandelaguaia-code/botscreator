/**
 * Catálogo de superpoderes y comandos que el panel muestra con "Copiar prompt".
 * Los prompts se pegan en Claude Code dentro de este repo; las skills viven en `.claude/skills/`.
 * Detalle técnico y números en docs/05-superpoderes.md y docs/04-agentes.md.
 */

export type PowerStatus = "activo" | "parcial" | "proximamente";

export interface Superpower {
  id: string;
  icon: string;
  name: string;
  tagline: string;
  description: string;
  /** Reglas y números concretos. */
  rules: string[];
  status: PowerStatus;
  /** Fase del roadmap en la que llega o se completa. */
  phase: number;
  /** Dónde se ajusta hoy. */
  configure?: string;
  prompt: string;
}

export const SUPERPOWERS: Superpower[] = [
  {
    id: "blindaje",
    icon: "🛡️",
    name: "Blindaje anti-invento",
    tagline: "Lo que no sabe, no lo inventa",
    description:
      "Busca en tu información antes de afirmar y revisa precios, horarios y promesas antes de enviar. Si algo no tiene respaldo, dice «déjame confirmarlo» y te pasa la conversación.",
    rules: [
      "Frenos de seguridad fijos al inicio del prompt",
      "Top 5 pasajes por mensaje, umbral de confianza 0.7 (bge-m3)",
      "Verificador pre-envío con veredicto estructurado",
      "Radar de huecos de 30 días en Mejoras",
    ],
    status: "activo",
    phase: 2,
    configure: "Configuración → Blindaje anti-invento",
    prompt:
      "Usa la skill superpoderes: revisa cómo está configurado el Blindaje anti-invento de mi bot, explícame qué hace con mis datos actuales y recomiéndame el umbral adecuado.",
  },
  {
    id: "handoff",
    icon: "🙋",
    name: "Handoff que sí atina",
    tagline: "Te pasa el chat justo cuando importa",
    description:
      "Escala cuando el cliente pide una persona, hay una queja, facturación, un tema legal o no logra resolver. Crea un ticket con el motivo, te avisa y se aparta mientras respondes.",
    rules: [
      "«Quiero hablar con una persona» se detecta sin gastar IA",
      "Ticket con motivo exacto y aviso por Telegram",
      "Al responder tú, el bot se aparta 60 min (configurable)",
      "Pausa manual de 30 min a 8 h o hasta reactivar",
    ],
    status: "parcial",
    phase: 3,
    configure: "Configuración → Comportamiento · Bandeja → Pausar bot",
    prompt:
      "Usa la skill superpoderes: configura el handoff de mi bot (cuánto tiempo se aparta cuando respondo y a qué Telegram me avisa) y explícame cuándo me va a pasar una conversación.",
  },
  {
    id: "voz",
    icon: "🗣️",
    name: "Voz de marca",
    tagline: "Suena como tu negocio",
    description:
      "Cercano, formal o divertido con un clic, o un retrato de voz armado con tu web y tus mensajes reales. Cambia cómo suena, nunca lo que puede prometer.",
    rules: [
      "3 presets que se aplican al siguiente mensaje",
      "Retrato a medida con la skill voz-de-marca",
    ],
    status: "activo",
    phase: 1,
    configure: "Configuración → Voz e idioma",
    prompt:
      "Usa la skill voz-de-marca: arma el retrato de voz de mi negocio a partir de mi página web y de estos mensajes que les escribo a mis clientes: [pega 5 mensajes].",
  },
  {
    id: "idiomas",
    icon: "🌎",
    name: "Multi-idioma",
    tagline: "Un bot, varios idiomas",
    description:
      "Español latino, de España, inglés o portugués, o modo espejo: contesta en el idioma en que le escribe cada cliente.",
    rules: ["es-419 · es-ES · en · pt-BR · espejo", "Moneda configurable"],
    status: "activo",
    phase: 1,
    configure: "Configuración → Voz e idioma",
    prompt:
      "Usa la skill superpoderes: pon mi bot en modo espejo para que conteste en el idioma de cada cliente y pruébalo con un mensaje en inglés y otro en portugués.",
  },
  {
    id: "botones",
    icon: "👆",
    name: "Botones tocables",
    tagline: "Elegir con un toque",
    description:
      "En elecciones cerradas (confirmar una cita, elegir un servicio) ofrece hasta 3 opciones para tocar. En la web y Telegram son botones; en otros canales, una lista numerada.",
    rules: ["Opt-in: vienen apagados", "Máximo 3 opciones de pocas palabras"],
    status: "activo",
    phase: 2,
    configure: "Configuración → Botones tocables",
    prompt:
      "Usa la skill superpoderes: activa los botones tocables en mi bot y muéstrame un ejemplo con una conversación de agendar.",
  },
  {
    id: "vigilante",
    icon: "📊",
    name: "Vigilante con IA",
    tagline: "Te avisa antes de perder al cliente",
    description:
      "Un analista califica cada conversación terminada y te avisa si un cliente quedó molesto o una venta está en riesgo. Además vigila la salud técnica del bot.",
    rules: [
      "Conversación cerrada tras 3 h de silencio",
      "Calificación 1–5★ en 8 dimensiones con el modelo rápido",
      "Watchdog: 3 fallas en 30 min → alerta, con freno de 6 h",
    ],
    status: "proximamente",
    phase: 4,
    prompt:
      "Implementa el Vigilante con IA según docs/05-superpoderes.md y el roadmap (fase 4), con tests y su sección en el panel.",
  },
  {
    id: "cazador",
    icon: "💰",
    name: "Cazador de ventas",
    tagline: "Rescata chats que se enfriaron",
    description:
      "Manda un solo seguimiento en tu tono a quien preguntó y no volvió, dentro de la ventana correcta.",
    rules: [
      "Ventana de 3 a 20 h tras el último mensaje",
      "1 toque por conversación de por vida, máximo 30 al día",
      "Nunca si está pausada o si el cliente habló último",
    ],
    status: "proximamente",
    phase: 4,
    prompt:
      "Implementa el Cazador de ventas según docs/05-superpoderes.md (fase 4), con sus garantías como tests.",
  },
  {
    id: "oido-vista",
    icon: "👂",
    name: "Oído y vista",
    tagline: "Entiende audios y fotos",
    description:
      "Transcribe notas de voz y entiende imágenes (productos, comprobantes, ubicaciones) para responder a lo que el cliente realmente mandó.",
    rules: ["Whisper en Workers AI, sin llave extra", "Imágenes con el mismo cerebro del bot"],
    status: "proximamente",
    phase: 3,
    prompt:
      "Implementa Oído y vista (fase 3): transcripción de notas de voz con Workers AI y visión de imágenes en los canales.",
  },
  {
    id: "reportes",
    icon: "🌙",
    name: "Reportes automáticos",
    tagline: "Tu día en un mensaje",
    description:
      "Cada noche te llega el resumen: conversaciones, leads nuevos, ventas calientes y clientes molestos. Mientras tanto, la skill reporte arma el informe mensual a pedido.",
    rules: ["Envío nocturno por Telegram o correo", "Hoy: skill reporte (manual)"],
    status: "proximamente",
    phase: 4,
    prompt: "Usa la skill reporte: hazme el informe de este mes en lenguaje de dueño de negocio.",
  },
  {
    id: "encuestas",
    icon: "⭐",
    name: "Encuestas de satisfacción",
    tagline: "Mide y te avisa si alguien quedó molesto",
    description:
      "Al cerrar una atención pide una calificación del 1 al 5 y/o un comentario; si es baja, te avisa al instante.",
    rules: ["1–5 y/o comentario libre", "Aviso inmediato con calificación baja"],
    status: "proximamente",
    phase: 4,
    prompt: "Implementa las Encuestas de satisfacción según docs/05-superpoderes.md (fase 4).",
  },
  {
    id: "no-shows",
    icon: "🔁",
    name: "Recupera no-shows",
    tagline: "Segundo intento, en tu tono",
    description:
      "Reengancha a los interesados que se enfriaron hace días. En WhatsApp fuera de 24 h usa tu plantilla aprobada.",
    rules: ["Solo leads calientes enfriados", "WhatsApp: plantilla aprobada por Meta"],
    status: "proximamente",
    phase: 4,
    prompt: "Implementa Recupera no-shows según docs/05-superpoderes.md (fase 4).",
  },
  {
    id: "resenas",
    icon: "📝",
    name: "Pide reseñas",
    tagline: "Clientes felices → reseñas",
    description:
      "Invita a dejar reseña en Google solo a quien quedó conforme. Se activa al conectar tu link de reseñas.",
    rules: ["Solo con satisfacción alta", "Requiere el link de Google del negocio"],
    status: "proximamente",
    phase: 4,
    prompt: "Implementa Pide reseñas según docs/05-superpoderes.md (fase 4).",
  },
  {
    id: "cobros",
    icon: "💳",
    name: "Cobros por chat",
    tagline: "Del «sí» al pago sin salir del chat",
    description: "Manda un link de pago de Stripe y te avisa cuando el pago se confirma.",
    rules: ["Link de pago + webhook de confirmación", "Se activa al conectar tu Stripe"],
    status: "proximamente",
    phase: 5,
    prompt: "Implementa Cobros por chat con Stripe según docs/05-superpoderes.md (fase 5).",
  },
  {
    id: "galeria",
    icon: "🖼️",
    name: "Galería",
    tagline: "Manda fotos, videos y audios reales",
    description:
      "El cliente pide ver el menú o el lugar y le llegan tus fotos o un video-recorrido reales, guardados en tu R2, con «cuándo usarlo».",
    rules: ["Archivos en R2 con nombre y cuándo usarlos", "Opt-in"],
    status: "proximamente",
    phase: 5,
    prompt: "Implementa la Galería según docs/05-superpoderes.md (fase 5).",
  },
];

export interface CommandItem {
  command: string;
  description: string;
  /** Texto para pegar en Claude Code (o en la terminal, si es un comando de terminal). */
  prompt: string;
}

export interface CommandGroup {
  title: string;
  hint: string;
  items: CommandItem[];
}

const skill = (name: string, ask: string): string => `/${name} ${ask}`.trim();

export const COMMAND_GROUPS: CommandGroup[] = [
  {
    title: "Terminal · CLI de operación",
    hint: "Se corren en la raíz del repo. Conectan con tu bot usando apps/bot/.yunque.json.",
    items: [
      {
        command: "pnpm yunque resumen",
        description: "Números del bot y gasto de IA del mes",
        prompt: "pnpm yunque resumen",
      },
      {
        command: "pnpm yunque prompt",
        description: "El prompt por secciones (🔒 bloqueadas)",
        prompt: "pnpm yunque prompt",
      },
      {
        command: "pnpm yunque probar",
        description: "Hablar con el bot como un cliente",
        prompt: 'pnpm yunque probar "¿A qué hora abren?"',
      },
      {
        command: "pnpm yunque huecos",
        description: "Radar de lo que el bot no supo",
        prompt: "pnpm yunque huecos",
      },
      {
        command: "pnpm yunque conocimiento:importar",
        description: "Importar una página de tu web",
        prompt: "pnpm yunque conocimiento:importar https://tunegocio.com/servicios",
      },
      {
        command: "pnpm yunque exportar",
        description: "Descargar leads o conversaciones",
        prompt: "pnpm yunque exportar leads.csv",
      },
      {
        command: "pnpm deploy",
        description: "Compilar el panel y desplegar el bot",
        prompt: "pnpm deploy",
      },
    ],
  },
  {
    title: "Agente · Montar y operar",
    hint: "Pega el prompt en Claude Code dentro de este repo.",
    items: [
      {
        command: "/configurar-bot",
        description: "Instalación completa: negocio, Cloudflare, deploy y canal",
        prompt: skill("configurar-bot", "Quiero montar el bot de mi negocio desde cero."),
      },
      {
        command: "/conectar-canal",
        description: "Chat de tu web o Telegram",
        prompt: skill("conectar-canal", "Conecta el chat de mi página web."),
      },
      {
        command: "/superpoderes",
        description: "Encender y ajustar superpoderes y cerebro de IA",
        prompt: skill(
          "superpoderes",
          "¿Qué superpoderes tengo activos y qué me recomiendas encender?",
        ),
      },
      {
        command: "/conocimiento",
        description: "Clonar tu web y cargar documentos",
        prompt: skill("conocimiento", "Arma la base de conocimiento con las páginas de mi sitio."),
      },
      {
        command: "/voz-de-marca",
        description: "Que el bot suene como tú",
        prompt: skill("voz-de-marca", "Haz que mi bot escriba como yo."),
      },
      {
        command: "/afinar",
        description: "Mejorar el bot con chats reales",
        prompt: skill("afinar", "Revisa lo que el bot no supo este mes y propón mejoras."),
      },
    ],
  },
  {
    title: "Agente · Prompt",
    hint: "El cerebro del bot: ver, editar y diagnosticar sin tocar los frenos.",
    items: [
      {
        command: "/prompt",
        description: "Ver y editar el prompt por secciones",
        prompt: skill("prompt", "Muéstrame mi prompt y ayúdame a editar las instrucciones."),
      },
      {
        command: "/auditar-prompt",
        description: "Diagnóstico con boleta (solo lectura)",
        prompt: skill("auditar-prompt", "Califica mi bot y dime los 5 arreglos más importantes."),
      },
    ],
  },
  {
    title: "Agente · Datos y calidad",
    hint: "Solo lectura salvo lo que apruebes.",
    items: [
      {
        command: "/reporte",
        description: "Informe mensual de valor",
        prompt: skill("reporte", "Hazme el reporte de este mes."),
      },
      {
        command: "/exportar",
        description: "Leads y conversaciones a CSV/JSON",
        prompt: skill("exportar", "Exporta mis leads a CSV."),
      },
      {
        command: "/mantenimiento",
        description: "Semáforo de salud y mejoras priorizadas",
        prompt: skill("mantenimiento", "Dale mantenimiento mensual a mi bot."),
      },
      {
        command: "/cliente-misterioso",
        description: "Clientes simulados y boleta de calidad",
        prompt: skill("cliente-misterioso", "Pon a prueba mi bot antes de entregarlo."),
      },
    ],
  },
  {
    title: "Agente · Modo agencia",
    hint: "Para montar y vender bots a otros negocios.",
    items: [
      {
        command: "/cliente-nuevo",
        description: "Bot aislado para un negocio cliente",
        prompt: skill("cliente-nuevo", "Monta un bot para mi cliente [nombre del negocio]."),
      },
      {
        command: "/cotizar",
        description: "Precio con costos reales y piso",
        prompt: skill("cotizar", "Cotiza un bot para [giro] con [canales]."),
      },
      {
        command: "/propuesta",
        description: "Documento comercial para cerrar",
        prompt: skill(
          "propuesta",
          "Haz la propuesta para [cliente] con la cotización recomendada.",
        ),
      },
    ],
  },
];
