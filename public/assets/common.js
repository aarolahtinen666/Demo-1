// Yhteiset apufunktiot kaikille sivuille.
(() => {
  const btn = document.querySelector(".menu-btn");
  const nav = document.getElementById("nav");
  if (btn && nav) {
    btn.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
  }

  const WD = ["su", "ma", "ti", "ke", "to", "pe", "la"];
  const WD_LONG = ["Sunnuntai", "Maanantai", "Tiistai", "Keskiviikko", "Torstai", "Perjantai", "Lauantai"];

  // Suomen aika riippumatta laitteen aikavyöhykkeestä
  function today() {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Helsinki", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  // Kellonaika Suomessa minuutteina keskiyöstä
  function nowMinutes() {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Helsinki", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    return Number(p.hour) * 60 + Number(p.minute);
  }
  const parts = (d) => d.split("-").map(Number);
  const weekday = (d) => { const [y, m, dd] = parts(d); return new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); };
  const addDays = (d, n) => { const [y, m, dd] = parts(d); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
  const fiDate = (d) => { const [y, m, dd] = parts(d); return `${dd}.${m}.${y}`; };
  const fiDateLong = (d) => `${WD_LONG[weekday(d)]} ${fiDate(d)}`;
  const hourLabel = (h) => (h ? `${h.open.replace(/^0/, "").replace(":00", "")}–${h.close.replace(/^0/, "").replace(":00", "")}` : "Suljettu");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  async function api(path, { method = "GET", body, token } = {}) {
    const res = await fetch(path, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const err = new Error(data.error || "Yhteys palvelimeen epäonnistui. Yritä uudelleen.");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  let settingsPromise;
  const settings = () => (settingsPromise ??= api("/api/settings"));

  window.K = { nowMinutes, WD, WD_LONG, today, weekday, addDays, fiDate, fiDateLong, hourLabel, esc, api, settings };
})();
