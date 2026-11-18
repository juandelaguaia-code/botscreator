/**
 * Giros de negocio: cómo atiende un bot de cada tipo de negocio. Cada giro aporta una guía de
 * atención (va al prompt), servicios típicos para que el dueño ponga sus precios, las preguntas
 * que más conviene responder y cómo se llama lo que se agenda.
 *
 * Nunca trae precios ni respuestas inventadas: el dueño completa los datos y el Blindaje impide
 * afirmar lo que no esté.
 */

export const GIRO_IDS = [
  "general",
  "restaurante",
  "cafeteria",
  "panaderia",
  "barberia",
  "salon",
  "spa",
  "dentista",
  "clinica",
  "gimnasio",
  "coach",
  "inmobiliaria",
  "tienda",
  "ventas",
  "hoteleria",
] as const;
export type GiroId = (typeof GIRO_IDS)[number];

export interface Giro {
  id: GiroId;
  name: string;
  /** Una línea para el selector. */
  pitch: string;
  /** Cómo se llama lo que se agenda en este giro. */
  bookingLabel: string;
  tone: "cercano" | "formal" | "divertido";
  /** Guía de atención que va al prompt (sección bloqueada). */
  playbook: string;
  /** Servicios o productos típicos, sin precio: el dueño pone los suyos. */
  suggestedOfferings: string[];
  /** Preguntas que conviene dejar respondidas en las FAQ. */
  suggestedQuestions: string[];
  /** Superpoderes que más rinden en el giro. */
  recommended: string[];
}

export const GIROS: Record<GiroId, Giro> = {
  general: {
    id: "general",
    name: "General",
    pitch: "Cualquier negocio: responde, capta interesados y pasa a una persona cuando importa.",
    bookingLabel: "Cita",
    tone: "cercano",
    playbook:
      "Identifica qué necesita el cliente con una pregunta corta, responde con los datos del negocio y, si quiere comprar o reservar, toma sus datos de contacto.",
    suggestedOfferings: [],
    suggestedQuestions: [
      "¿Cuál es el horario?",
      "¿Dónde están ubicados?",
      "¿Qué formas de pago aceptan?",
    ],
    recommended: ["blindaje", "handoff", "cazador"],
  },
  restaurante: {
    id: "restaurante",
    name: "Restaurante",
    pitch: "Reservas, menú y pedidos sin que el teléfono te gane.",
    bookingLabel: "Reserva",
    tone: "cercano",
    playbook: `- Para reservar pregunta, de a uno: fecha, hora, número de personas y nombre. Para grupos grandes o eventos, toma los datos y pasa la conversación al equipo.
- Menú y precios solo de la información del negocio; si preguntan por un platillo que no aparece, di que lo confirmas.
- Alergias o dietas especiales: nunca garantices que un platillo es apto; ofrece consultarlo con cocina y escala.
- Pedidos para llevar o a domicilio: confirma productos, cantidades, dirección y forma de pago antes de cerrar.`,
    suggestedOfferings: ["Menú del día", "Reserva de mesa", "Pedido para llevar", "Evento privado"],
    suggestedQuestions: [
      "¿Hacen reservas para grupos grandes?",
      "¿Tienen opciones vegetarianas o sin gluten?",
      "¿Hacen entregas a domicilio y a qué zonas?",
      "¿Hay estacionamiento?",
    ],
    recommended: ["agenda", "galeria", "resenas", "recordatorios"],
  },
  cafeteria: {
    id: "cafeteria",
    name: "Cafetería",
    pitch: "Pedidos, horario y promociones del día al instante.",
    bookingLabel: "Pedido",
    tone: "divertido",
    playbook: `- Respuestas muy breves y amables; menciona la promoción vigente cuando venga al caso.
- Pedidos anticipados: confirma bebida, tamaño, extras, hora de retiro y nombre.
- Si preguntan por leches vegetales o sin azúcar, responde solo con lo que esté en la carta.`,
    suggestedOfferings: ["Café de especialidad", "Bebidas frías", "Pastelería", "Desayunos"],
    suggestedQuestions: [
      "¿Tienen leches vegetales?",
      "¿Puedo pedir para retirar?",
      "¿Tienen wifi y enchufes?",
    ],
    recommended: ["galeria", "resenas", "campanas"],
  },
  panaderia: {
    id: "panaderia",
    name: "Panadería y pastelería",
    pitch: "Encargos y lo que salió del horno hoy, sin perder pedidos.",
    bookingLabel: "Encargo",
    tone: "cercano",
    playbook: `- Encargos (pasteles, bandejas): pide fecha de retiro, cantidad o porciones, sabor, mensaje o decoración, nombre y teléfono; si requiere anticipo, dilo según la información del negocio.
- Respeta los días de anticipación que pida el negocio; si piden algo para antes, ofrece consultarlo con el equipo.
- Ingredientes y alérgenos: solo lo que esté publicado; si no, confírmalo con el equipo.`,
    suggestedOfferings: [
      "Pastel personalizado",
      "Pan del día",
      "Bandeja para eventos",
      "Galletas y bocadillos",
    ],
    suggestedQuestions: [
      "¿Con cuántos días de anticipación se encarga un pastel?",
      "¿Piden anticipo para los encargos?",
      "¿Hacen envíos?",
    ],
    recommended: ["galeria", "cobros", "recordatorios"],
  },
  barberia: {
    id: "barberia",
    name: "Barbería",
    pitch: "Llena la agenda y baja las inasistencias.",
    bookingLabel: "Cita",
    tone: "cercano",
    playbook: `- Para agendar: servicio, día, hora y, si el negocio lo maneja, con qué barbero. Ofrece los horarios libres en vez de preguntar abierto.
- Si el cliente llega tarde o quiere cambiar su hora, ayúdalo a reagendar y recuérdale la política del negocio si existe.
- Combos (corte + barba) solo con el precio publicado.`,
    suggestedOfferings: [
      "Corte de cabello",
      "Arreglo de barba",
      "Corte + barba",
      "Afeitado clásico",
    ],
    suggestedQuestions: [
      "¿Atienden sin cita?",
      "¿Cuánto dura un corte?",
      "¿Cuál es la política si llego tarde o no puedo ir?",
    ],
    recommended: ["agenda", "recordatorios", "no-shows", "resenas"],
  },
  salon: {
    id: "salon",
    name: "Salón de belleza",
    pitch: "Agenda por servicio y por estilista, sin ir y venir.",
    bookingLabel: "Cita",
    tone: "cercano",
    playbook: `- Pregunta qué servicio quiere y, para color o tratamientos, el largo del cabello si el precio depende de eso.
- Si un precio es "desde" o depende de una valoración, dilo así y ofrece agendar una valoración; nunca des un precio exacto que no esté publicado.
- Para servicios largos, avisa la duración aproximada que figure en la información del negocio.`,
    suggestedOfferings: ["Corte y peinado", "Color", "Manicure", "Tratamiento capilar"],
    suggestedQuestions: [
      "¿El precio del color depende del largo del cabello?",
      "¿Puedo elegir estilista?",
      "¿Qué marcas de productos usan?",
    ],
    recommended: ["agenda", "galeria", "recordatorios", "resenas"],
  },
  spa: {
    id: "spa",
    name: "Spa",
    pitch: "Citas, paquetes y recordatorios que sí llegan.",
    bookingLabel: "Cita",
    tone: "formal",
    playbook: `- Tono calmado y cuidado. Para agendar: tratamiento, fecha, hora y nombre; si es para regalo, ofrece la opción de certificado si el negocio la tiene.
- Contraindicaciones (embarazo, lesiones, condiciones de salud): no las evalúes; recomienda consultarlo con el equipo antes de reservar.
- Paquetes y promociones solo como estén publicados.`,
    suggestedOfferings: ["Masaje relajante", "Facial", "Circuito de spa", "Paquete en pareja"],
    suggestedQuestions: [
      "¿Con cuánta anticipación debo llegar?",
      "¿Cuál es la política de cancelación?",
      "¿Venden certificados de regalo?",
    ],
    recommended: ["agenda", "recordatorios", "cobros", "resenas"],
  },
  dentista: {
    id: "dentista",
    name: "Dentista",
    pitch: "Agenda tratamientos y confirma quién viene.",
    bookingLabel: "Cita",
    tone: "formal",
    playbook: `- Nunca diagnostiques ni recomiendes tratamientos o medicamentos; ante dolor o síntomas, ofrece la primera hora disponible o pasa al equipo.
- Urgencias (dolor fuerte, inflamación, golpe, sangrado): da el teléfono de urgencias del negocio si existe y escala de inmediato.
- Precios de tratamientos suelen depender de una valoración: dilo así y agenda la valoración.
- No pidas ni guardes información médica detallada por chat.`,
    suggestedOfferings: [
      "Valoración",
      "Limpieza dental",
      "Blanqueamiento",
      "Ortodoncia (valoración)",
    ],
    suggestedQuestions: [
      "¿Aceptan seguros o convenios?",
      "¿Cuánto cuesta la valoración?",
      "¿Atienden urgencias?",
    ],
    recommended: ["agenda", "recordatorios", "no-shows", "encuestas"],
  },
  clinica: {
    id: "clinica",
    name: "Clínica",
    pitch: "Orientación básica, citas y seguimiento con cuidado.",
    bookingLabel: "Cita",
    tone: "formal",
    playbook: `- Nunca des diagnósticos, interpretes exámenes ni indiques medicamentos o dosis.
- Si describen una emergencia (dolor en el pecho, dificultad para respirar, sangrado abundante, pérdida de conciencia), indica llamar de inmediato al número de emergencias de su país y avisa al equipo.
- Para agendar: especialidad o profesional, fecha, hora, nombre y teléfono. Pide solo los datos necesarios para la cita.
- Coberturas, convenios y preparación para exámenes: solo según la información del negocio.`,
    suggestedOfferings: ["Consulta general", "Consulta de especialidad", "Exámenes", "Control"],
    suggestedQuestions: [
      "¿Qué especialidades atienden?",
      "¿Qué convenios o seguros aceptan?",
      "¿Cómo me preparo para un examen?",
    ],
    recommended: ["agenda", "recordatorios", "encuestas", "handoff"],
  },
  gimnasio: {
    id: "gimnasio",
    name: "Gimnasio",
    pitch: "Membresías, clases y retención de socios.",
    bookingLabel: "Clase",
    tone: "divertido",
    playbook: `- Energía positiva sin presionar. Si preguntan por precios, muestra los planes publicados y ofrece una clase de prueba si existe.
- Para clases: disciplina, día y hora; recuerda el cupo si el negocio lo indica.
- Congelamientos, cambios de plan y cancelaciones: explica la política publicada y pasa al equipo para gestionarlo.
- No des indicaciones médicas ni nutricionales personalizadas.`,
    suggestedOfferings: [
      "Membresía mensual",
      "Clase de prueba",
      "Plan anual",
      "Entrenamiento personal",
    ],
    suggestedQuestions: [
      "¿Tienen clase de prueba?",
      "¿Cuál es el horario de las clases?",
      "¿Puedo congelar mi plan?",
    ],
    recommended: ["cazador", "no-shows", "campanas", "encuestas"],
  },
  coach: {
    id: "coach",
    name: "Coach / consultor",
    pitch: "Califica interesados y agenda tus sesiones.",
    bookingLabel: "Sesión",
    tone: "cercano",
    playbook: `- Antes de agendar, entiende con 2 o 3 preguntas el objetivo del cliente y si encaja con los servicios del negocio.
- Ofrece la sesión inicial o de diagnóstico si existe; si no encaja, dilo con respeto.
- No prometas resultados; habla de cómo se trabaja según la información del negocio.`,
    suggestedOfferings: [
      "Sesión de diagnóstico",
      "Programa de acompañamiento",
      "Sesión individual",
    ],
    suggestedQuestions: [
      "¿Cómo son las sesiones?",
      "¿Son en línea o presenciales?",
      "¿Cuánto dura el programa?",
    ],
    recommended: ["agenda", "cazador", "cobros"],
  },
  inmobiliaria: {
    id: "inmobiliaria",
    name: "Inmobiliaria",
    pitch: "Filtra prospectos y agenda visitas.",
    bookingLabel: "Visita",
    tone: "formal",
    playbook: `- Califica de a una pregunta: compra o arriendo, zona, presupuesto, tipo de propiedad y plazo.
- Solo menciona propiedades, precios y características que estén en la información o la base de conocimiento; nunca inventes disponibilidad.
- Para visitar: propiedad, día, hora, nombre y teléfono. Si piden negociar el precio o condiciones, pasa al equipo.
- No des asesoría legal ni financiera; ofrece que un asesor lo contacte.`,
    suggestedOfferings: [
      "Visita a propiedad",
      "Tasación",
      "Asesoría de compra",
      "Administración de arriendos",
    ],
    suggestedQuestions: [
      "¿Qué documentos piden para arrendar?",
      "¿Cobran comisión y de cuánto?",
      "¿Trabajan con crédito hipotecario?",
    ],
    recommended: ["agenda", "galeria", "cazador", "no-shows"],
  },
  tienda: {
    id: "tienda",
    name: "Tienda",
    pitch: "Catálogo, stock y la venta cerrada en el chat.",
    bookingLabel: "Pedido",
    tone: "cercano",
    playbook: `- Ayuda a elegir con preguntas cortas (uso, talla o medida, presupuesto) y muestra solo productos de la información o la base de conocimiento.
- Stock: si no está indicado, no lo prometas; ofrece confirmarlo.
- Para cerrar: producto, cantidad, envío o retiro, dirección y forma de pago; si hay cobros activos, genera el link.
- Cambios y devoluciones: según la política publicada.`,
    suggestedOfferings: ["Producto estrella", "Envío a domicilio", "Retiro en tienda"],
    suggestedQuestions: [
      "¿Cuánto tarda el envío?",
      "¿Cuál es la política de cambios?",
      "¿Tienen tienda física?",
    ],
    recommended: ["cobros", "galeria", "cazador", "campanas"],
  },
  ventas: {
    id: "ventas",
    name: "CRM / ventas",
    pitch: "Persigue cada lead hasta el cierre.",
    bookingLabel: "Reunión",
    tone: "formal",
    playbook: `- Objetivo: entender la necesidad, calificar y conseguir una reunión o los datos de contacto.
- Califica con naturalidad: qué busca, para cuándo, tamaño o volumen y quién decide.
- Registra el lead apenas tengas nombre y contacto; cotizaciones formales y descuentos siempre los ve el equipo.`,
    suggestedOfferings: ["Reunión de diagnóstico", "Cotización", "Demostración"],
    suggestedQuestions: [
      "¿Cómo es el proceso de contratación?",
      "¿Trabajan con empresas de mi tamaño?",
      "¿Tienen casos de éxito?",
    ],
    recommended: ["cazador", "no-shows", "agenda", "vigilante"],
  },
  hoteleria: {
    id: "hoteleria",
    name: "Hotelería",
    pitch: "Disponibilidad, reservas y huéspedes contentos.",
    bookingLabel: "Reserva",
    tone: "formal",
    playbook: `- Para reservar: fechas de entrada y salida, número de huéspedes, tipo de habitación y nombre. Nunca confirmes disponibilidad ni tarifas que no estén en la información; ofrece confirmarlas.
- Check-in, check-out, mascotas, estacionamiento y desayuno: según la información del negocio.
- Huéspedes con un problema durante su estadía: pide disculpas, toma el detalle y pasa al equipo de inmediato.`,
    suggestedOfferings: ["Habitación doble", "Habitación familiar", "Desayuno", "Traslado"],
    suggestedQuestions: [
      "¿A qué hora es el check-in y el check-out?",
      "¿Aceptan mascotas?",
      "¿El desayuno está incluido?",
      "¿Cuál es la política de cancelación?",
    ],
    recommended: ["galeria", "recordatorios", "resenas", "encuestas"],
  },
};

export function giroOf(id: string | undefined | null): Giro {
  return GIROS[(id ?? "general") as GiroId] ?? GIROS.general;
}

/**
 * Detección liviana del idioma del cliente (es / en / pt) para el modo espejo, contando palabras
 * frecuentes. Devuelve null si no hay señal clara.
 */
export function detectLanguage(text: string): "es-419" | "en" | "pt-BR" | null {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  const lists = {
    "es-419": [
      "hola",
      "que",
      "como",
      "quiero",
      "gracias",
      "por",
      "favor",
      "tienen",
      "precio",
      "cuanto",
      "el",
      "la",
      "los",
      "una",
      "para",
      "hay",
      "buenas",
      "necesito",
    ],
    en: [
      "hi",
      "hello",
      "the",
      "what",
      "how",
      "want",
      "thanks",
      "please",
      "do",
      "you",
      "have",
      "price",
      "much",
      "is",
      "are",
      "can",
      "i",
      "need",
    ],
    "pt-BR": [
      "ola",
      "oi",
      "voce",
      "voces",
      "quero",
      "obrigado",
      "obrigada",
      "tem",
      "preco",
      "quanto",
      "uma",
      "nao",
      "sim",
      "bom",
      "dia",
      "preciso",
      "com",
    ],
  } as const;
  const scores = Object.entries(lists).map(
    ([lang, list]) =>
      [lang, words.filter((w) => (list as readonly string[]).includes(w)).length] as const,
  );
  scores.sort((a, b) => b[1] - a[1]);
  const [best, second] = scores;
  if (!best || best[1] === 0 || (second && best[1] === second[1])) return null;
  return best[0] as "es-419" | "en" | "pt-BR";
}
