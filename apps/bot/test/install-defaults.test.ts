import { describe, expect, it } from "vitest";
import { loadConfig, SETTINGS_KEYS } from "../src/engine/config.js";
import { D1Store } from "../src/store/d1.js";
import { createTestD1 } from "./helpers/sqlite-d1.js";

describe("valores iniciales del instalador", () => {
  it("el bot recién instalado arranca con el giro, idioma, moneda y zona del instalador", async () => {
    const store = new D1Store(createTestD1());
    const { profile } = await loadConfig(store, {
      botName: "Barbería Don Pepe",
      profile: { giro: "barberia", language: "en", currency: "€", timezone: "Europe/Madrid" },
    });
    expect(profile).toMatchObject({
      name: "Barbería Don Pepe",
      giro: "barberia",
      language: "en",
      currency: "€",
      timezone: "Europe/Madrid",
    });
  });

  it("ignora un valor inválido sin romper los demás", async () => {
    const store = new D1Store(createTestD1());
    const { profile } = await loadConfig(store, {
      profile: { giro: "astronauta", language: "es-ES" },
    });
    expect(profile.giro).toBe("general");
    expect(profile.language).toBe("es-ES");
  });

  it("lo que el dueño guardó manda sobre los valores iniciales", async () => {
    const store = new D1Store(createTestD1());
    await store.setSetting(SETTINGS_KEYS.profile, { name: "Spa Luz", giro: "spa" });
    const { profile } = await loadConfig(store, { profile: { giro: "barberia" } });
    expect(profile.giro).toBe("spa");
  });
});
