// Hallinnan kirjautuminen: POST /api/admin-login { password } -> { token }
import { checkPassword, issueToken, isDemoMode } from "../lib/auth.mjs";
import { json, readJson, handleError } from "../lib/http.mjs";

export default async (req) => {
  try {
    if (req.method !== "POST") return json({ error: "Väärä metodi" }, 405);
    const { password } = await readJson(req);
    if (!checkPassword(password || "")) {
      await new Promise((r) => setTimeout(r, 600)); // hidastaa arvailua
      return json({ error: "Väärä salasana" }, 401);
    }
    return json({ token: issueToken(), demo: isDemoMode() });
  } catch (e) {
    return handleError(e);
  }
};

export const config = {
  path: "/api/admin-login",
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
