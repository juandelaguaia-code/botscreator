/**
 * Widget de chat embebible. Se instala en el sitio del negocio con:
 *   <script src="https://TU-BOT.workers.dev/widget.js" data-title="Tacos Ana" data-color="#1f8a5b" defer></script>
 * Guarda un id de visitante en localStorage y consulta cada pocos segundos si un humano respondió.
 */
export const WIDGET_JS = `(() => {
  if (window.__yunqueWidget) return;
  window.__yunqueWidget = true;
  const script = document.currentScript;
  const origin = new URL(script.src).origin;
  const title = script.dataset.title || "Chat";
  const color = script.dataset.color || "#2563eb";
  const greeting = script.dataset.greeting || "¡Hola! ¿En qué te puedo ayudar?";
  const KEY = "yunque_visitor";
  let visitorId = localStorage.getItem(KEY);
  if (!visitorId) {
    visitorId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/-/g, "");
    localStorage.setItem(KEY, visitorId);
  }
  let lastSeen = Date.now();
  let open = false;
  let poll = null;

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483000;font-family:system-ui,sans-serif";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = '<style>' +
    '.btn{width:56px;height:56px;border-radius:50%;border:0;background:' + color + ';color:#fff;font-size:26px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25)}' +
    '.panel{display:none;flex-direction:column;width:340px;max-width:calc(100vw - 40px);height:480px;max-height:calc(100vh - 110px);background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.25);overflow:hidden;margin-bottom:12px}' +
    '.panel.open{display:flex}.head{background:' + color + ';color:#fff;padding:14px 16px;font-weight:600}' +
    '.log{flex:1;overflow-y:auto;padding:12px;background:#f6f7f9;display:flex;flex-direction:column;gap:8px}' +
    '.m{max-width:80%;padding:8px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}' +
    '.u{align-self:flex-end;background:' + color + ';color:#fff;border-bottom-right-radius:4px}' +
    '.b{align-self:flex-start;background:#fff;color:#111;border:1px solid #e5e7eb;border-bottom-left-radius:4px}' +
    '.opts{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start}' +
    '.opts button{border:1px solid ' + color + ';background:#fff;color:' + color + ';border-radius:999px;padding:6px 12px;font-size:13px;cursor:pointer}' +
    'form{display:flex;border-top:1px solid #e5e7eb}input{flex:1;border:0;padding:12px;font-size:14px;outline:none}' +
    'form button{border:0;background:none;color:' + color + ';font-weight:600;padding:0 14px;cursor:pointer}' +
    '</style><div class="panel"><div class="head"></div><div class="log"></div>' +
    '<form><input placeholder="Escribe tu mensaje…" maxlength="2000" /><button>Enviar</button></form></div>' +
    '<div style="text-align:right"><button class="btn" aria-label="Abrir chat">💬</button></div>';

  const panel = root.querySelector(".panel");
  const log = root.querySelector(".log");
  const input = root.querySelector("input");
  root.querySelector(".head").textContent = title;

  function add(text, who) {
    const el = document.createElement("div");
    el.className = "m " + who;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  async function check() {
    try {
      const r = await fetch(origin + "/api/web/messages?visitorId=" + encodeURIComponent(visitorId) + "&after=" + lastSeen);
      if (!r.ok) return;
      const data = await r.json();
      for (const m of data.messages) { if (m.role === "human") add(m.content, "b"); lastSeen = Math.max(lastSeen, m.createdAt); }
    } catch (_) {}
  }

  root.querySelector(".btn").addEventListener("click", () => {
    open = !open;
    panel.classList.toggle("open", open);
    if (open && !log.children.length) add(greeting, "b");
    if (open) { input.focus(); poll = setInterval(check, 5000); } else clearInterval(poll);
  });

  function addMedia(list) {
    for (const m of list || []) {
      const wrap = document.createElement("div");
      wrap.className = "m b";
      let el;
      if (m.kind === "image") { el = document.createElement("img"); el.style.cssText = "max-width:100%;border-radius:10px;display:block"; }
      else if (m.kind === "video") { el = document.createElement("video"); el.controls = true; el.style.cssText = "max-width:100%;border-radius:10px"; }
      else if (m.kind === "audio") { el = document.createElement("audio"); el.controls = true; }
      else { el = document.createElement("a"); el.textContent = "Abrir archivo"; el.target = "_blank"; el.rel = "noopener"; el.href = m.url; }
      if (el.tagName !== "A") el.src = m.url.startsWith("http") ? m.url : origin + m.url;
      wrap.appendChild(el);
      log.appendChild(wrap);
    }
    log.scrollTop = log.scrollHeight;
  }

  function addButtons(buttons) {
    if (!buttons || !buttons.length) return;
    const row = document.createElement("div");
    row.className = "opts";
    for (const label of buttons) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.addEventListener("click", () => { row.remove(); send(label); });
      row.appendChild(btn);
    }
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  async function send(text) {
    log.querySelectorAll(".opts").forEach((el) => el.remove());
    add(text, "u");
    try {
      const r = await fetch(origin + "/api/web/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visitorId, text }),
      });
      const data = await r.json();
      if (data.reply) add(data.reply, "b");
      addMedia(data.attachments);
      addButtons(data.buttons);
      lastSeen = Date.now();
    } catch (_) {
      add("No pude enviar tu mensaje. Intenta de nuevo.", "b");
    }
  }

  root.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    send(text);
  });

  document.body.appendChild(host);
})();`;
