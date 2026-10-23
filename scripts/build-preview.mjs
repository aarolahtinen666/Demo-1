// Kokoaa koko sivuston yhdeksi esikatselutiedostoksi (preview/index.html).
// Varauslogiikka ajetaan selaimessa samalla koodilla kuin Netlify Functionsissa;
// tallennus on selaimen muistissa (+ localStorage), sähköpostit näytetään esikatseluna.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// --- Sivut ---
const pageFiles = { "/": "index", "/palvelut": "palvelut", "/varaa": "varaa", "/yhteystiedot": "yhteystiedot", "/peru": "peru", "/tietosuoja": "tietosuoja", "/hallinta": "hallinta" };
const scriptsByPage = { "/": "home", "/palvelut": "home", "/yhteystiedot": "home", "/varaa": "booking", "/peru": "cancel", "/hallinta": "admin" };
const index = rd("public/index.html");
const header = index.match(/<header[\s\S]*?<\/header>/)[0];
const footer = index.match(/<footer[\s\S]*?<\/footer>/)[0].replace(' · <a href="mailto', '<br><a href="mailto');
const pages = {};
for (const [path, file] of Object.entries(pageFiles)) {
  const html = rd(`public/${file}.html`);
  pages[path] = { title: html.match(/<title>(.*?)<\/title>/)[1], main: html.match(/<main id="main">([\s\S]*?)<\/main>/)[1] };
}

// --- Selaimen sivuskriptit funktioiksi ---
const pageScript = (name) => {
  let src = rd(`public/assets/${name}.js`);
  src = src.replace(/location\.search/g, "__routeQuery()");
  src = src.replace(/if \(!confirm\((.*?)\)\) return;/g, "if (!(await __confirm($1))) return;");
  if (/confirm\(/.test(src.replace(/__confirm\(/g, ""))) throw new Error(`confirm() jäi: ${name}`);
  return `function(){\n${src}\n}`;
};
const scripts = ["home", "booking", "cancel", "admin"].map((n) => `${JSON.stringify(n)}: ${pageScript(n)}`).join(",\n");

let common = rd("public/assets/common.js").replace('const settings = () => (settingsPromise ??= api("/api/settings"));', 'const settings = () => api("/api/settings");');

// --- Backend selaimeen ---
const strip = (src) => src.replace(/^import[\s\S]*?;\s*$/gm, "").replace(/^export (async function|function|const|class|let)/gm, "$1");
const fn = (file, name) => strip(rd(file).replace(/^export default /m, `const ${name} = `).replace(/^export const config = [\s\S]*?;\s*$/m, ""));
const backend = `
const process = { env: {} };
const randomUUID = () => (crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
const randomBytes = (n) => { const a = crypto.getRandomValues(new Uint8Array(n)); return { toString: () => btoa(String.fromCharCode(...a)).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "") }; };
${strip(rd("netlify/lib/time.mjs"))}
${strip(rd("netlify/lib/settings.mjs"))}
// Tallennus: muisti + localStorage (vain tässä selaimessa)
const LS_KEY = "kuura-demo-store-v1";
const mem = new Map();
try { const raw = localStorage.getItem(LS_KEY); if (raw) for (const [k, v] of JSON.parse(raw)) mem.set(k, v); } catch {}
const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify([...mem])); } catch {} };
const tick = () => new Promise((r) => setTimeout(r, 0));
const memStore = {
  async get(key, o = {}) { await tick(); if (!mem.has(key)) return null; const v = mem.get(key); return o.type === "json" ? JSON.parse(v) : v; },
  async setJSON(key, value, o = {}) { await tick(); if (o.onlyIfNew && mem.has(key)) return { modified: false }; mem.set(key, JSON.stringify(value)); persist(); return { modified: true }; },
  async delete(key) { await tick(); mem.delete(key); persist(); },
  async list(o = {}) { await tick(); const p = o.prefix || ""; return { blobs: [...mem.keys()].filter((k) => k.startsWith(p)).sort().map((key) => ({ key })) }; },
};
const db = () => memStore;
${strip(rd("netlify/lib/booking.mjs"))}
${strip(rd("netlify/lib/email.mjs"))}
${strip(rd("netlify/lib/http.mjs"))}
// Kirjautuminen esikatselussa: demosalasana
const DEMO_PASSWORD = "kuura-demo";
const isDemoMode = () => true;
const checkPassword = (p) => p === DEMO_PASSWORD;
const issueToken = () => "demo-session";
const verifyRequest = (req) => req.headers.get("authorization") === "Bearer demo-session";
${fn("netlify/functions/api.mjs", "H_api")}
${fn("netlify/functions/admin.mjs", "H_admin")}
${fn("netlify/functions/admin-login.mjs", "H_login")}

// Esimerkkivaraukset koko kuluvalle ja seuraavalle viikolle, jotta hallinnassa näkyy heti jotain.
// Kirjoitetaan suoraan varastoon (myös menneille päiville), samalla rakenteella kuin oikea varaus.
async function seed() {
  if (mem.size) return;
  const s = await getSettings();
  const people = [
    ["Mikko Laine", "040 111 2233", "mikko.laine@example.com", "leikkaus", ""],
    ["Sanna Virtanen", "050 444 5566", "sanna.v@example.com", "varjays", "Vaaleampi sävy kuin viimeksi"],
    ["Juha Korhonen", "044 777 8899", "juha.k@example.com", "combo", ""],
    ["Eetu Mäkinen", "040 222 3344", "eetu.m@example.com", "lapset", "Ensimmäinen kerta"],
    ["Tommi Heikkinen", "050 999 0011", "tommi.h@example.com", "parta", ""],
    ["Laura Nieminen", "045 123 9876", "laura.n@example.com", "leikkaus", "Otsatukka lyhyemmäksi"],
    ["Antti Salo", "040 555 6677", "antti.salo@example.com", "combo", ""],
  ];
  const times = ["09:30", "11:00", "13:30", "10:00", "15:00", "12:00", "14:00"];
  const today = helsinkiNow().date;
  let day = addDays(today, -((weekday(today) + 6) % 7)); // kuluvan viikon maanantai
  let n = 0;
  for (let i = 0; i < 12; i++, day = addDays(day, 1)) {
    const h = s.hours[weekday(day)];
    if (!h || s.closedDates.includes(day)) continue;
    for (let k = 0; k < 2; k++, n++) {
      const [name, phone, email, serviceId, note] = people[n % people.length];
      const sv = s.services.find((x) => x.id === serviceId);
      let time = times[n % times.length];
      if (toMinutes(time) < toMinutes(h.open)) time = h.open;
      if (toMinutes(time) + sv.duration > toMinutes(h.close)) time = fromMinutes(toMinutes(h.close) - Math.ceil(sv.duration / 30) * 30 - 30);
      if (toMinutes(time) < toMinutes(h.open)) continue;
      const id = randomUUID().slice(0, 8);
      const token = randomBytes(18).toString();
      try { await lockSlots(day, slotTimesFor(s, time, sv.duration), { type: "booking", id }); } catch { continue; }
      await db().setJSON(\`bookings/\${day}/\${id}\`, {
        id, token, date: day, time, end: fromMinutes(toMinutes(time) + sv.duration),
        serviceId, serviceName: sv.name, duration: sv.duration, price: sv.price,
        name, email, phone, note, status: "confirmed", createdAt: new Date().toISOString(),
      });
      await db().setJSON(\`tokens/\${token}\`, { date: day, id });
    }
  }
}
const ready = seed();

const FAKE = "https://parturikuura.example";
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url, FAKE);
  if (url.origin !== FAKE || !url.pathname.startsWith("/api/")) return realFetch(input, init);
  await ready;
  await new Promise((r) => setTimeout(r, 120));
  const req = new Request(url, init);
  if (url.pathname === "/api/admin-login") return H_login(req);
  if (url.pathname.startsWith("/api/admin/")) return H_admin(req);
  return H_api(req);
};
window.__resetDemo = () => { mem.clear(); try { localStorage.removeItem(LS_KEY); } catch {} };
window.__FAKE = FAKE;
`;

// --- Tyylit ---
let css = rd("public/assets/style.css")
  .replace(".wrap { max-width: var(--wrap); margin: 0 auto; padding: 0 16px; }",
    ".wrap { max-width: var(--wrap); margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }")
  .replace(".site-header { background: var(--snow); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 20; }",
    ".site-header { background: var(--snow); border-bottom: 1px solid var(--line); position: sticky; top: env(safe-area-inset-top, 0px); z-index: 20; }\nbody::before { content: \"\"; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 30; background: var(--snow); }")
  .replace("padding: 8px 16px 16px; display: none; }", "padding: 8px max(16px, env(safe-area-inset-right, 0px)) 16px max(16px, env(safe-area-inset-left, 0px)); display: none; }");
css = `:root { color-scheme: light; }\n${css}
.demo-strip { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: flex; flex-wrap: wrap; gap: 4px 12px; justify-content: center; align-items: center; }
.demo-strip button { font: inherit; font-size: .85rem; color: var(--frost); background: none; border: 1px solid #4b6b63; border-radius: 999px; padding: 2px 10px; cursor: pointer; }
.k-dialog { position: fixed; inset: 0; z-index: 50; background: rgba(22, 48, 43, .55); display: grid; place-items: center; padding: 16px; }
.k-dialog-box { background: var(--snow); color: var(--pine); border-radius: var(--radius-l); padding: 22px; max-width: 380px; width: 100%; }
.k-dialog-box p { margin: 0 0 18px; font-weight: 600; font-size: 1.05rem; }
.k-dialog-box div { display: flex; gap: 10px; flex-wrap: wrap; }`;

const out = `<title>Parturi Kuura</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#16302b">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&display=swap">
<style>
${css}
</style>
<div class="demo-strip"><span>Esikatselu: Parturi Kuura on kuvitteellinen yritys. Varaukset tallentuvat vain tähän selaimeen.</span><button type="button" data-reset>Tyhjennä demovaraukset</button></div>
${header}
<main id="main"></main>
${footer}
<script>
${backend}
</script>
<script>
${common}
</script>
<script>
(() => {
  const PAGES = ${JSON.stringify(pages)};
  const SCRIPT_OF = ${JSON.stringify(scriptsByPage)};
  const SCRIPTS = {
${scripts}
  };
  let query = new URLSearchParams();
  window.__routeQuery = () => "?" + query.toString();

  // Sivun sisäinen vahvistusikkuna (selaimen confirm() ei toimi esikatselussa)
  window.__confirm = (msg) => new Promise((resolve) => {
    const d = document.createElement("div");
    d.className = "k-dialog";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-modal", "true");
    d.innerHTML = '<div class="k-dialog-box"><p></p><div><button class="btn" data-yes>Kyllä</button><button class="btn btn-quiet" data-no>Peruuta</button></div></div>';
    d.querySelector("p").textContent = msg;
    const done = (v) => { d.remove(); resolve(v); };
    d.addEventListener("click", (e) => { if (e.target.closest("[data-yes]")) done(true); else if (e.target.closest("[data-no]") || e.target === d) done(false); });
    document.body.appendChild(d);
    d.querySelector("[data-yes]").focus();
  });

  const main = document.getElementById("main");
  function go(href, push = true) {
    const u = new URL(href, window.__FAKE);
    const path = PAGES[u.pathname] ? u.pathname : "/";
    query = u.searchParams;
    const p = PAGES[path];
    document.title = p.title;
    main.innerHTML = p.main;
    document.querySelectorAll("#nav a:not(.btn)").forEach((a) => a.toggleAttribute("aria-current", a.getAttribute("href") === path));
    document.querySelectorAll("#nav a[aria-current]").forEach((a) => a.setAttribute("aria-current", "page"));
    const nav = document.getElementById("nav");
    nav?.classList.remove("open");
    document.querySelector(".menu-btn")?.setAttribute("aria-expanded", "false");
    window.scrollTo(0, 0);
    const s = SCRIPT_OF[path];
    if (s) SCRIPTS[s]();
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href");
    if (/^(tel:|mailto:|https?:\\/\\/(?!parturikuura\\.example))/.test(href)) return;
    const u = new URL(href, window.__FAKE);
    if (u.origin !== window.__FAKE) return;
    e.preventDefault();
    go(u.pathname + u.search);
  });
  document.querySelector("[data-reset]").addEventListener("click", async () => {
    if (!(await window.__confirm("Tyhjennetäänkö kaikki demovaraukset ja asetukset tästä selaimesta?"))) return;
    window.__resetDemo();
    try { sessionStorage.removeItem("kuura-admin"); } catch {}
    location.reload();
  });
  go("/");
})();
</script>
`;
mkdirSync(new URL("../preview/", import.meta.url), { recursive: true });
writeFileSync(new URL("../preview/index.html", import.meta.url), out);
console.log("preview/index.html", (out.length / 1024).toFixed(0), "kt");
