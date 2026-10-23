// VAIN PAIKALLISEEN TESTAUKSEEN: muistissa toimiva korvike @netlify/blobs-kirjastolle.
// Tukee samaa osaa rajapinnasta, jota sivusto käyttää (get, setJSON + onlyIfNew, list, delete).
// Netlifyssä käytetään oikeaa kirjastoa, joka asentuu buildissa package.jsonista.
const stores = globalThis.__mockBlobStores ??= new Map();
export function getStore(opts) {
  const name = typeof opts === "string" ? opts : opts.name;
  if (!stores.has(name)) stores.set(name, new Map());
  const m = stores.get(name);
  const tick = () => new Promise((r) => setImmediate(r)); // simuloi verkkoviivettä => paljastaa kilpailutilanteet
  return {
    async get(key, o = {}) { await tick(); if (!m.has(key)) return null; const v = m.get(key); return o.type === "json" ? JSON.parse(v) : v; },
    async setJSON(key, value, o = {}) { await tick(); if (o.onlyIfNew && m.has(key)) return { modified: false }; m.set(key, JSON.stringify(value)); return { modified: true, etag: String(Date.now()) }; },
    async set(key, value, o = {}) { await tick(); if (o.onlyIfNew && m.has(key)) return { modified: false }; m.set(key, String(value)); return { modified: true }; },
    async delete(key) { await tick(); m.delete(key); },
    async list(o = {}) { await tick(); const p = o.prefix || ""; return { blobs: [...m.keys()].filter((k) => k.startsWith(p)).sort().map((key) => ({ key, etag: "x" })), directories: [] }; },
  };
}
