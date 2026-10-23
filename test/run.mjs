// Paikallinen testiajo: kutsuu funktioita suoraan Request-olioilla muistivarastoa vasten.
// Aja: node scripts/link-mock.mjs && node test/run.mjs
import assert from "node:assert/strict";
import api from "../netlify/functions/api.mjs";
import admin from "../netlify/functions/admin.mjs";
import login from "../netlify/functions/admin-login.mjs";
import { helsinkiNow, addDays, weekday } from "../netlify/lib/time.mjs";

globalThis.Netlify = { env: { get: (k) => process.env[k] } };

const BASE = "https://testi.example";
let token = "";
const call = async (fn, method, path, body, auth) => {
  const res = await fn(new Request(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }));
  return { status: res.status, data: await res.json() };
};

// Seuraava tiistai (avoinna 9-17)
let day = addDays(helsinkiNow().date, 1);
while (weekday(day) !== 2) day = addDays(day, 1);
const sunday = (() => { let d = day; while (weekday(d) !== 0) d = addDays(d, 1); return d; })();

const customer = { name: "Testi Asiakas", email: "testi@example.com", phone: "040 123 4567" };
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log("  ✓", name); };

console.log(`Testipäivä ${day}\n`);

await test("asetukset ja palvelut latautuvat", async () => {
  const r = await call(api, "GET", "/api/settings");
  assert.equal(r.status, 200);
  assert.ok(r.data.services.length >= 3);
  assert.equal(r.data.demo.email, true);
});

await test("tiistaina 16 vapaata 30 min aikaa (9-17)", async () => {
  const r = await call(api, "GET", `/api/slots?date=${day}&service=leikkaus`);
  assert.equal(r.data.slots.length, 16);
  assert.equal(r.data.slots[0], "09:00");
  assert.equal(r.data.slots.at(-1), "16:30");
});

await test("sunnuntai on suljettu", async () => {
  const r = await call(api, "GET", `/api/slots?date=${sunday}&service=leikkaus`);
  assert.equal(r.data.closed, "Suljettu");
});

let booking1;
await test("varaus onnistuu ja palauttaa vahvistusviestin esikatselun", async () => {
  const r = await call(api, "POST", "/api/book", { ...customer, date: day, time: "10:00", serviceId: "combo" });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.email, "demo");
  assert.match(r.data.preview.subject, /Varausvahvistus/);
  assert.match(r.data.preview.html, /peru\?t=/);
  booking1 = r.data;
});

await test("60 min varaus vie kaksi jaksoa (10:00 ja 10:30)", async () => {
  const r = await call(api, "GET", `/api/slots?date=${day}&service=leikkaus`);
  assert.ok(!r.data.slots.includes("10:00") && !r.data.slots.includes("10:30"));
  assert.ok(r.data.slots.includes("09:30") && r.data.slots.includes("11:00"));
  const r2 = await call(api, "GET", `/api/slots?date=${day}&service=combo`);
  assert.ok(!r2.data.slots.includes("09:30"), "60 min ei mahdu 9:30 alkaen");
});

await test("päällekkäinen varaus estyy", async () => {
  const r = await call(api, "POST", "/api/book", { ...customer, date: day, time: "10:30", serviceId: "leikkaus" });
  assert.equal(r.status, 409);
});

await test("samanaikaiset varaukset samaan aikaan: vain yksi onnistuu", async () => {
  const reqs = Array.from({ length: 6 }, (_, i) =>
    call(api, "POST", "/api/book", { ...customer, name: `Kilpailija ${i}`, date: day, time: "13:00", serviceId: "leikkaus" }));
  const results = await Promise.all(reqs);
  assert.equal(results.filter((r) => r.status === 201).length, 1, results.map((r) => r.status).join(","));
});

await test("virheelliset tiedot hylätään", async () => {
  const r = await call(api, "POST", "/api/book", { ...customer, email: "eiosoite", date: day, time: "15:00", serviceId: "leikkaus" });
  assert.equal(r.status, 400);
  const r2 = await call(api, "POST", "/api/book", { ...customer, date: sunday, time: "10:00", serviceId: "leikkaus" });
  assert.equal(r2.status, 400);
});

await test("asiakas näkee ja voi perua varauksen linkillä", async () => {
  const t = new URL(booking1.cancelUrl).searchParams.get("t");
  const r = await call(api, "GET", `/api/booking?t=${t}`);
  assert.equal(r.data.status, "confirmed");
  assert.equal(r.data.canCancel, true);
  const c = await call(api, "POST", "/api/cancel", { t });
  assert.equal(c.data.status, "cancelled");
  const s = await call(api, "GET", `/api/slots?date=${day}&service=leikkaus`);
  assert.ok(s.data.slots.includes("10:00"), "peruttu aika vapautui");
});

await test("väärällä salasanalla ei pääse hallintaan", async () => {
  const r = await call(login, "POST", "/api/admin-login", { password: "väärä" });
  assert.equal(r.status, 401);
  const r2 = await call(admin, "GET", `/api/admin/bookings?from=${day}&to=${day}`, null, false);
  assert.equal(r2.status, 401);
});

await test("kirjautuminen (demotila) ja varauslistaus", async () => {
  const r = await call(login, "POST", "/api/admin-login", { password: "kuura-demo" });
  assert.equal(r.status, 200);
  token = r.data.token;
  const l = await call(admin, "GET", `/api/admin/bookings?from=${day}&to=${addDays(day, 6)}`, null, true);
  assert.equal(l.status, 200);
  assert.equal(l.data.bookings.length, 2); // peruttu + 13:00
});

await test("yrittäjä siirtää varauksen ja asiakas saa viestin", async () => {
  const l = await call(admin, "GET", `/api/admin/bookings?from=${day}&to=${day}`, null, true);
  const b = l.data.bookings.find((x) => x.status === "confirmed");
  const s = await call(admin, "GET", `/api/admin/slots?date=${day}&id=${b.id}&newDate=${day}`, null, true);
  assert.ok(s.data.slots.includes("13:00"), "oma aika näkyy vapaana siirrossa");
  const next = addDays(day, 1);
  const m = await call(admin, "POST", "/api/admin/move", { date: day, id: b.id, newDate: next, newTime: "11:00" }, true);
  assert.equal(m.status, 200, JSON.stringify(m.data));
  assert.equal(m.data.email, "demo");
  const s1 = await call(api, "GET", `/api/slots?date=${day}&service=leikkaus`);
  assert.ok(s1.data.slots.includes("13:00"), "vanha aika vapautui");
  const s2 = await call(api, "GET", `/api/slots?date=${next}&service=leikkaus`);
  assert.ok(!s2.data.slots.includes("11:00"), "uusi aika varattu");
});

await test("siirto saman päivän päällekkäiseen aikaan toimii (60 min 10:00 -> 10:30)", async () => {
  const b = await call(api, "POST", "/api/book", { ...customer, date: day, time: "10:00", serviceId: "combo" });
  const l = await call(admin, "GET", `/api/admin/bookings?from=${day}&to=${day}`, null, true);
  const id = l.data.bookings.find((x) => x.status === "confirmed" && x.time === "10:00").id;
  const m = await call(admin, "POST", "/api/admin/move", { date: day, id, newDate: day, newTime: "10:30" }, true);
  assert.equal(m.status, 200, JSON.stringify(m.data));
  const s = await call(api, "GET", `/api/slots?date=${day}&service=leikkaus`);
  assert.ok(s.data.slots.includes("10:00") && !s.data.slots.includes("10:30") && !s.data.slots.includes("11:00"));
  assert.ok(b.status === 201);
});

await test("yrittäjä sulkee aikavälin ja avaa sen uudelleen", async () => {
  const bl = await call(admin, "POST", "/api/admin/block", { date: day, start: "14:00", end: "16:00", reason: "Koulutus" }, true);
  assert.equal(bl.status, 201, JSON.stringify(bl.data));
  let s = await call(api, "GET", `/api/slots?date=${day}&service=leikkaus`);
  assert.ok(!s.data.slots.includes("14:00") && !s.data.slots.includes("15:30") && s.data.slots.includes("16:00"));
  const clash = await call(admin, "POST", "/api/admin/block", { date: day, start: "10:00", end: "11:00" }, true);
  assert.equal(clash.status, 409, "varauksen päälle ei voi sulkea");
  await call(admin, "POST", "/api/admin/unblock", { date: day, id: bl.data.block.id }, true);
  s = await call(api, "GET", `/api/slots?date=${day}&service=leikkaus`);
  assert.ok(s.data.slots.includes("14:00"));
});

await test("yrittäjä peruu varauksen", async () => {
  const l = await call(admin, "GET", `/api/admin/bookings?from=${day}&to=${day}`, null, true);
  const b = l.data.bookings.find((x) => x.status === "confirmed");
  const c = await call(admin, "POST", "/api/admin/cancel", { date: day, id: b.id }, true);
  assert.equal(c.data.booking.status, "cancelled");
  assert.equal(c.data.booking.cancelledBy, "owner");
});

await test("aukioloaikojen muutos vaikuttaa vapaisiin aikoihin", async () => {
  const g = await call(admin, "GET", "/api/admin/settings", null, true);
  const settings = g.data;
  settings.hours[2] = { open: "12:00", close: "15:00" };
  settings.closedDates.push(addDays(day, 7));
  const p = await call(admin, "PUT", "/api/admin/settings", settings, true);
  assert.equal(p.status, 200, JSON.stringify(p.data));
  const s = await call(api, "GET", `/api/slots?date=${day}&service=leikkaus`);
  assert.equal(s.data.slots[0], "12:00");
  assert.equal(s.data.slots.at(-1), "14:30");
  const c = await call(api, "GET", `/api/slots?date=${addDays(day, 7)}&service=leikkaus`);
  assert.equal(c.data.closed, "Suljettu");
  const bad = await call(admin, "PUT", "/api/admin/settings", { ...settings, hours: { ...settings.hours, 1: { open: "18:00", close: "09:00" } } }, true);
  assert.equal(bad.status, 400);
});

console.log(`\n${passed} testiä läpi.`);
