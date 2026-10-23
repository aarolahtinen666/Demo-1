// Oletusasetukset. Yrittäjä voi muuttaa näitä hallintanäkymästä,
// jolloin muutokset tallentuvat Blobs-varastoon avaimella "settings".

export const DEFAULT_SETTINGS = {
  business: {
    name: "Parturi Kuura",
    address: "Esimerkkikatu 5, 40100 Jyväskylä",
    phone: "040 000 0000",
    email: "hello@parturikuura.example",
  },
  slotMinutes: 30,
  minNoticeMinutes: 60, // varaus vähintään tunnin päähän
  maxDaysAhead: 60,
  cancelCutoffHours: 2, // asiakas voi perua itse viimeistään 2 h ennen
  // Viikonpäivät: 0 = sunnuntai ... 6 = lauantai. null = suljettu.
  hours: {
    0: null,
    1: { open: "09:00", close: "17:00" },
    2: { open: "09:00", close: "17:00" },
    3: { open: "09:00", close: "18:00" },
    4: { open: "09:00", close: "17:00" },
    5: { open: "09:00", close: "16:00" },
    6: { open: "10:00", close: "14:00" },
  },
  closedDates: ["2026-12-24", "2026-12-25", "2026-12-26", "2027-01-01"],
  services: [
    { id: "leikkaus", name: "Hiustenleikkaus", duration: 30, price: 32, desc: "Pesu, leikkaus ja muotoilu." },
    { id: "parta", name: "Parran muotoilu", duration: 30, price: 25, desc: "Siistiminen, linjat ja kuuma pyyhe." },
    { id: "combo", name: "Leikkaus + parta", duration: 60, price: 52, desc: "Koko paketti kerralla." },
    { id: "lapset", name: "Lasten leikkaus", duration: 30, price: 22, desc: "Alle 12-vuotiaille." },
    { id: "varjays", name: "Värjäys", duration: 90, price: 85, desc: "Sävytys tai värjäys, sis. leikkauksen." },
  ],
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Tarkistaa hallinnasta tulevat asetukset. Palauttaa siistityn kopion tai heittää virheen.
export function validateSettings(input) {
  const s = structuredClone(DEFAULT_SETTINGS);
  if (typeof input !== "object" || !input) throw new Error("Asetukset puuttuvat");

  if (input.business) {
    for (const k of ["name", "address", "phone", "email"]) {
      if (typeof input.business[k] === "string") s.business[k] = input.business[k].slice(0, 120).trim();
    }
  }
  for (const [k, min, max] of [["minNoticeMinutes", 0, 2880], ["maxDaysAhead", 1, 365], ["cancelCutoffHours", 0, 168]]) {
    if (input[k] !== undefined) {
      const n = Number(input[k]);
      if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Virheellinen arvo: ${k}`);
      s[k] = n;
    }
  }
  if (input.hours) {
    for (let d = 0; d <= 6; d++) {
      const h = input.hours[d];
      if (h === null || h === undefined || h === false) { s.hours[d] = null; continue; }
      if (!TIME_RE.test(h.open) || !TIME_RE.test(h.close) || h.open >= h.close) {
        throw new Error("Tarkista aukioloajat (muoto HH:MM, avaus ennen sulkemista)");
      }
      s.hours[d] = { open: h.open, close: h.close };
    }
  }
  if (Array.isArray(input.closedDates)) {
    s.closedDates = [...new Set(input.closedDates.filter((d) => DATE_RE.test(d)))].sort().slice(0, 400);
  }
  if (Array.isArray(input.services)) {
    if (input.services.length === 0) throw new Error("Lisää vähintään yksi palvelu");
    const ids = new Set();
    s.services = input.services.slice(0, 30).map((sv, i) => {
      const name = String(sv.name || "").trim().slice(0, 60);
      const duration = Number(sv.duration);
      const price = Number(sv.price);
      if (!name) throw new Error(`Palvelulta ${i + 1} puuttuu nimi`);
      if (!Number.isInteger(duration) || duration < 15 || duration > 480 || duration % 15) {
        throw new Error(`Palvelun "${name}" kesto pitää olla 15–480 min (15 min välein)`);
      }
      if (!Number.isFinite(price) || price < 0 || price > 10000) throw new Error(`Palvelun "${name}" hinta on virheellinen`);
      let id = String(sv.id || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30);
      if (!id) id = name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || `palvelu-${i + 1}`;
      while (ids.has(id)) id += "-2";
      ids.add(id);
      return { id, name, duration, price, desc: String(sv.desc || "").trim().slice(0, 160) };
    });
  }
  return s;
}

// Julkinen osa asetuksista (näytetään varaussivulla).
export function publicSettings(s) {
  return {
    business: s.business,
    slotMinutes: s.slotMinutes,
    minNoticeMinutes: s.minNoticeMinutes,
    maxDaysAhead: s.maxDaysAhead,
    cancelCutoffHours: s.cancelCutoffHours,
    hours: s.hours,
    closedDates: s.closedDates,
    services: s.services,
  };
}
