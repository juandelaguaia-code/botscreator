import type { Language } from "./business.js";

/** Idioma concreto para textos de sistema (el modo `espejo` usa español latino de base). */
export type SystemLocale = Exclude<Language, "espejo">;

export function systemLocale(language: Language): SystemLocale {
  return language === "espejo" ? "es-419" : language;
}

export type SystemMessageKey =
  | "handoffAck"
  | "errorFallback"
  | "botPausedNotice"
  | "rateLimited"
  | "confirmWithTeam"
  | "unsupportedMedia"
  | "budgetReached";

const MESSAGES: Record<SystemLocale, Record<SystemMessageKey, string>> = {
  "es-419": {
    handoffAck: "¡Claro! Ya le avisé al equipo y en un momento te atiende una persona. 🙌",
    errorFallback:
      "Perdón, tuve un problema para responderte. Ya le avisé al equipo para que te contacte.",
    botPausedNotice: "Un miembro del equipo está atendiendo esta conversación.",
    rateLimited: "Recibí muchos mensajes seguidos. Dame un momento y te respondo.",
    confirmWithTeam:
      "Déjame confirmarlo con el equipo para no darte un dato equivocado. En un momento te respondemos. 🙌",
    unsupportedMedia:
      "Por ahora no puedo abrir ese tipo de archivo. ¿Me lo escribes en un mensaje?",
    budgetReached:
      "Gracias por escribir. En este momento te atiende el equipo directamente; en breve te respondemos.",
  },
  "es-ES": {
    handoffAck: "¡Por supuesto! Ya he avisado al equipo y enseguida te atiende una persona. 🙌",
    errorFallback:
      "Disculpa, he tenido un problema al responderte. Ya he avisado al equipo para que te contacte.",
    botPausedNotice: "Un miembro del equipo está atendiendo esta conversación.",
    rateLimited: "He recibido muchos mensajes seguidos. Dame un momento y te respondo.",
    confirmWithTeam:
      "Déjame confirmarlo con el equipo para no darte un dato equivocado. Enseguida te respondemos. 🙌",
    unsupportedMedia:
      "Por ahora no puedo abrir ese tipo de archivo. ¿Me lo escribes en un mensaje?",
    budgetReached:
      "Gracias por escribir. Ahora mismo te atiende el equipo directamente; enseguida te respondemos.",
  },
  en: {
    handoffAck: "Of course! I've let the team know and a person will be with you shortly. 🙌",
    errorFallback:
      "Sorry, I had trouble answering. I've let the team know so they can reach out to you.",
    botPausedNotice: "A team member is handling this conversation.",
    rateLimited: "I got a lot of messages in a row. Give me a moment and I'll get back to you.",
    confirmWithTeam:
      "Let me confirm that with the team so I don't give you the wrong info. We'll get back to you shortly. 🙌",
    unsupportedMedia: "I can't open that type of file yet. Could you write it in a message?",
    budgetReached: "Thanks for writing. The team will reply to you directly very soon.",
  },
  "pt-BR": {
    handoffAck: "Claro! Já avisei a equipe e logo uma pessoa vai te atender. 🙌",
    errorFallback:
      "Desculpe, tive um problema para responder. Já avisei a equipe para entrar em contato.",
    botPausedNotice: "Um membro da equipe está atendendo esta conversa.",
    rateLimited: "Recebi muitas mensagens seguidas. Me dá um momento que já te respondo.",
    confirmWithTeam:
      "Deixa eu confirmar com a equipe para não te passar uma informação errada. Já te respondemos. 🙌",
    unsupportedMedia:
      "Ainda não consigo abrir esse tipo de arquivo. Pode me escrever numa mensagem?",
    budgetReached: "Obrigado por escrever. A equipe vai te responder diretamente em breve.",
  },
};

export function systemMessage(language: Language, key: SystemMessageKey): string {
  return MESSAGES[systemLocale(language)][key];
}

const LANGUAGE_NAMES: Record<SystemLocale, string> = {
  "es-419": "español latinoamericano (tutea si el tono lo permite)",
  "es-ES": "español de España",
  en: "English",
  "pt-BR": "português do Brasil",
};

export function languageInstruction(language: Language): string {
  if (language === "espejo") {
    return "Responde siempre en el mismo idioma en que te escribe el cliente (español, inglés o portugués). Si no está claro, usa español latinoamericano.";
  }
  return `Responde siempre en ${LANGUAGE_NAMES[language]}, aunque el cliente escriba en otro idioma, salvo que te pida explícitamente cambiar.`;
}
