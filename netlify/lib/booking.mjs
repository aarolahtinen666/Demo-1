import { randomBytes, randomUUID } from "node:crypto";
import { db } from "./store.mjs";
import { DEFAULT_SETTINGS, validateSettings } from "./settings.mjs";
import { helsinkiNow, toMinutes, fromMinutes, isValidDate, weekday, addDays, daysBetween } from "./time.mjs";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- Asetukset ----------

export async function getSettings() {
  const saved = await db().get("settings", { type: "json" });
  if (!saved) return structuredClone(DEFAULT_SETTINGS);
  return { ...structuredClone(DEFAULT_SETTINGS), ...saved };
}

export async function saveSettings(input) {
  let clean;
  try {
    clean = validateSettings(input);
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  await db().setJSON("settings", clean);
  return clean;
}

// ---------- Vapaat ajat ----------

function blocksNeeded(settings, duration) {
  return Math.ceil(duration / settings.slotMinutes);
}

function slotTimesFor(settings, start, duration) {
  const n = blocksNeeded(settings, duration);
  return Array.from({ length: n }, (_, i) => fromMinutes(toMinutes(start) + i * settings.slotMinutes));
}

// Hakee päivän varatut jaksot: Map<"HH:MM", { type, id }>
async function occupiedSlots(date) {
  const { blobs } = await db().list({ prefix: `slots/${date}/` });
  const map = new Map();
  await Promise.all(
    blobs.map(async (b) => {
      const v = await db().get(b.key, { type: "json" });
      if (v) map.set(b.key.split("/").pop(), v);
    }),
  );
  return map;
}

// Syy, miksi päivä ei ole varattavissa, tai null.
export function dayClosedReason(settings, date, now = helsinkiNow()) {
  if (!isValidDate(date)) return "Virheellinen päivämäärä";
  const diff = daysBetween(now.date, date);
  if (diff < 0) return "Päivä on mennyt";
  if (diff > settings.maxDaysAhead) return `Varauksia voi tehdä ${settings.maxDaysAhead} päivän päähän`;
  if (settings.closedDates.includes(date)) return "Suljettu";
  if (!settings.hours[weekday(date)]) return "Suljettu";
  return null;
}

export async function availableSlots(settings, date, serviceId, { ignoreBookingId, now = helsinkiNow() } = {}) {
  const service = settings.services.find((s) => s.id === serviceId);
  if (!service) throw new HttpError(400, "Tuntematon palvelu");
  const closed = dayClosedReason(settings, date, now);
  if (closed) return { closed, slots: [] };

  const hours = settings.hours[weekday(date)];
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);
  const step = settings.slotMinutes;
  const length = blocksNeeded(settings, service.duration) * step;
  const occupied = await occupiedSlots(date);
  const isFree = (t) => {
    const v = occupied.get(t);
    return !v || (ignoreBookingId && v.type === "booking" && v.id === ignoreBookingId);
  };
  const dayOffset = daysBetween(now.date, date) * 1440;

  const slots = [];
  for (let start = open; start + length <= close; start += step) {
    if (dayOffset + start - now.minutes < settings.minNoticeMinutes) continue;
    const times = slotTimesFor(settings, fromMinutes(start), service.duration);
    if (times.every(isFree)) slots.push(fromMinutes(start));
  }
  return { closed: null, slots, service };
}

// ---------- Lukitus (estää tuplavaraukset) ----------

// Lukitsee jaksot atomisesti. Jos jokin on jo varattu, vapauttaa omat ja heittää 409.
async function lockSlots(date, times, value, { reuseForId } = {}) {
  const acquired = [];
  for (const t of times) {
    const key = `slots/${date}/${t}`;
    const res = await db().setJSON(key, value, { onlyIfNew: true });
    // Vanhat @netlify/blobs-versiot eivät tue ehdollista kirjoitusta (ne palauttavat undefined).
    // Pysäytetään silloin selkeään virheeseen, ettei tuplavaraus pääse hiljaa läpi.
    if (!res || typeof res.modified !== "boolean") {
      await Promise.all(acquired.map((k) => db().delete(k)));
      throw new Error("@netlify/blobs ei tue ehdollisia kirjoituksia (onlyIfNew). Päivitä kirjasto versioon 10.");
    }
    const { modified } = res;
    if (modified) {
      acquired.push(key);
      continue;
    }
    if (reuseForId) {
      const existing = await db().get(key, { type: "json" });
      if (existing && existing.type === value.type && existing.id === reuseForId) continue;
    }
    await Promise.all(acquired.map((k) => db().delete(k)));
    throw new HttpError(409, "Valitettavasti aika ehdittiin juuri varata. Valitse toinen aika.");
  }
}

async function releaseSlots(date, times, ownerId) {
  await Promise.all(
    times.map(async (t) => {
      const key = `slots/${date}/${t}`;
      const v = await db().get(key, { type: "json" });
      if (v && v.id === ownerId) await db().delete(key);
    }),
  );
}

// ---------- Varaukset ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateCustomer(input) {
  const name = String(input.name || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const phone = String(input.phone || "").trim();
  const note = String(input.note || "").trim();
  if (name.length < 2 || name.length > 80) throw new HttpError(400, "Kirjoita nimesi (2–80 merkkiä)");
  if (!EMAIL_RE.test(email) || email.length > 120) throw new HttpError(400, "Tarkista sähköpostiosoite");
  if (!/^\+?[0-9 ()-]{5,20}$/.test(phone)) throw new HttpError(400, "Tarkista puhelinnumero");
  if (note.length > 500) throw new HttpError(400, "Lisätieto on liian pitkä (max 500 merkkiä)");
  return { name, email, phone, note };
}

export async function createBooking(input) {
  if (input.website) throw new HttpError(400, "Varaus hylättiin"); // roskapostiansa
  const settings = await getSettings();
  const { date, time, serviceId } = input;
  const customer = validateCustomer(input);

  const { closed, slots, service } = await availableSlots(settings, date, serviceId);
  if (closed) throw new HttpError(400, closed);
  if (!slots.includes(time)) throw new HttpError(409, "Valittu aika ei ole enää vapaana. Valitse toinen aika.");

  const id = randomUUID().slice(0, 8);
  const token = randomBytes(18).toString("base64url");
  const times = slotTimesFor(settings, time, service.duration);
  const booking = {
    id, token, date, time,
    end: fromMinutes(toMinutes(time) + service.duration),
    serviceId: service.id, serviceName: service.name, duration: service.duration, price: service.price,
    ...customer,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  // Ensin varaus "pending"-tilassa, sitten lukot. Jos jotain kaatuu välissä,
  // jäänne näkyy hallinnassa eikä jää näkymättömäksi tukokseksi.
  await db().setJSON(`bookings/${date}/${id}`, booking);
  try {
    await lockSlots(date, times, { type: "booking", id });
  } catch (e) {
    await db().delete(`bookings/${date}/${id}`);
    throw e;
  }
  booking.status = "confirmed";
  await db().setJSON(`bookings/${date}/${id}`, booking);
  await db().setJSON(`tokens/${token}`, { date, id });
  return { booking, settings };
}

export async function getBooking(date, id) {
  if (!isValidDate(date) || !/^[a-z0-9-]{1,40}$/i.test(id)) return null;
  return db().get(`bookings/${date}/${id}`, { type: "json" });
}

export async function getBookingByToken(token) {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token || "")) return null;
  const ref = await db().get(`tokens/${token}`, { type: "json" });
  if (!ref) return null;
  const booking = await getBooking(ref.date, ref.id);
  return booking && booking.token === token ? booking : null;
}

export function canCustomerCancel(settings, booking, now = helsinkiNow()) {
  if (booking.status !== "confirmed") return false;
  const minutesUntil = daysBetween(now.date, booking.date) * 1440 + toMinutes(booking.time) - now.minutes;
  return minutesUntil >= settings.cancelCutoffHours * 60;
}

export async function cancelBooking(booking, by) {
  if (booking.status === "cancelled") return booking;
  const settings = await getSettings();
  booking.status = "cancelled";
  booking.cancelledAt = new Date().toISOString();
  booking.cancelledBy = by;
  await db().setJSON(`bookings/${booking.date}/${booking.id}`, booking);
  await releaseSlots(booking.date, slotTimesFor(settings, booking.time, booking.duration), booking.id);
  return booking;
}

export async function moveBooking(booking, newDate, newTime) {
  if (booking.status !== "confirmed") throw new HttpError(400, "Vain voimassa olevan varauksen voi siirtää");
  const settings = await getSettings();
  const service = settings.services.find((s) => s.id === booking.serviceId) || {
    id: booking.serviceId, duration: booking.duration,
  };
  // Siirto tarkistaa vapaat ajat samalla kestolla kuin alkuperäinen varaus.
  const tmp = { ...settings, services: [{ ...service, id: "__move", duration: booking.duration }] };
  const { closed, slots } = await availableSlots(tmp, newDate, "__move", { ignoreBookingId: booking.id, now: { date: helsinkiNow().date, minutes: -1e9 } });
  if (closed && closed !== "Päivä on mennyt") throw new HttpError(400, `Uusi päivä: ${closed}`);
  if (!slots.includes(newTime)) throw new HttpError(409, "Uusi aika ei ole vapaana");

  const oldDate = booking.date;
  const oldTimes = slotTimesFor(settings, booking.time, booking.duration);
  const newTimes = slotTimesFor(settings, newTime, booking.duration);
  await lockSlots(newDate, newTimes, { type: "booking", id: booking.id }, { reuseForId: newDate === oldDate ? booking.id : undefined });

  const keep = newDate === oldDate ? new Set(newTimes) : new Set();
  await releaseSlots(oldDate, oldTimes.filter((t) => !keep.has(t)), booking.id);

  const moved = {
    ...booking, date: newDate, time: newTime,
    end: fromMinutes(toMinutes(newTime) + booking.duration),
    movedFrom: { date: oldDate, time: booking.time }, movedAt: new Date().toISOString(),
  };
  await db().setJSON(`bookings/${newDate}/${booking.id}`, moved);
  if (newDate !== oldDate) await db().delete(`bookings/${oldDate}/${booking.id}`);
  await db().setJSON(`tokens/${booking.token}`, { date: newDate, id: booking.id });
  return moved;
}

export async function listBookings(from, to) {
  if (!isValidDate(from) || !isValidDate(to) || daysBetween(from, to) < 0 || daysBetween(from, to) > 62) {
    throw new HttpError(400, "Virheellinen aikaväli (max 62 päivää)");
  }
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const read = async (prefix) => {
    const { blobs } = await db().list({ prefix });
    return Promise.all(blobs.map((b) => db().get(b.key, { type: "json" })));
  };
  const [bookings, blocks] = await Promise.all([
    Promise.all(days.map((d) => read(`bookings/${d}/`))).then((r) => r.flat().filter(Boolean)),
    Promise.all(days.map((d) => read(`blocks/${d}/`))).then((r) => r.flat().filter(Boolean)),
  ]);
  const sort = (a, b) => (a.date + (a.time || a.start)).localeCompare(b.date + (b.time || b.start));
  return { bookings: bookings.sort(sort), blocks: blocks.sort(sort) };
}

// ---------- Yrittäjän sulkemat ajat ----------

export async function addBlock({ date, start, end, reason }) {
  const settings = await getSettings();
  if (!isValidDate(date)) throw new HttpError(400, "Virheellinen päivämäärä");
  if (!/^\d{2}:\d{2}$/.test(start || "") || !/^\d{2}:\d{2}$/.test(end || "") || start >= end) {
    throw new HttpError(400, "Tarkista alku- ja loppuaika");
  }
  const step = settings.slotMinutes;
  const s = Math.floor(toMinutes(start) / step) * step;
  const e = Math.ceil(toMinutes(end) / step) * step;
  const times = [];
  for (let t = s; t < e; t += step) times.push(fromMinutes(t));

  const occupied = await occupiedSlots(date);
  const clash = times.filter((t) => occupied.get(t)?.type === "booking");
  if (clash.length) throw new HttpError(409, `Aikavälillä on varauksia (${clash.join(", ")}). Peru tai siirrä ne ensin.`);

  const id = randomUUID().slice(0, 8);
  const block = { id, date, start: fromMinutes(s), end: fromMinutes(e), reason: String(reason || "").slice(0, 80), createdAt: new Date().toISOString() };
  // Jo valmiiksi suljetut jaksot ohitetaan, uudet lukitaan.
  const free = times.filter((t) => !occupied.has(t));
  await lockSlots(date, free, { type: "block", id });
  block.slots = free;
  await db().setJSON(`blocks/${date}/${id}`, block);
  return block;
}

export async function removeBlock(date, id) {
  if (!isValidDate(date) || !/^[a-z0-9-]{1,40}$/i.test(id || "")) throw new HttpError(400, "Virheellinen tunniste");
  const block = await db().get(`blocks/${date}/${id}`, { type: "json" });
  if (!block) throw new HttpError(404, "Suljettua aikaa ei löytynyt");
  await releaseSlots(date, block.slots || [], id);
  await db().delete(`blocks/${date}/${id}`);
  return block;
}
