import { createHmac, timingSafeEqual } from "node:crypto";

// Hallinnan kirjautuminen. Salasana asetetaan Netlifyssä ympäristömuuttujaan
// ADMIN_PASSWORD. Jos sitä ei ole asetettu, sivu on demotilassa ja salasana
// on DEMO_PASSWORD (näytetään kirjautumissivulla). Oikealle asiakkaalle
// ADMIN_PASSWORD pitää AINA asettaa.

export const DEMO_PASSWORD = "kuura-demo";
const SESSION_HOURS = 12;

const env = (k) => (globalThis.Netlify?.env?.get(k) ?? process.env[k] ?? "").trim();

export const isDemoMode = () => !env("ADMIN_PASSWORD");
const password = () => env("ADMIN_PASSWORD") || DEMO_PASSWORD;
const secret = () => `${env("SESSION_SECRET")}|${password()}`;

const sign = (payload) => createHmac("sha256", secret()).update(payload).digest("base64url");

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function checkPassword(input) {
  return safeEqual(input, password());
}

export function issueToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600e3 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyRequest(req) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}
