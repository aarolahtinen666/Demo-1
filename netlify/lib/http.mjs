import { HttpError } from "./booking.mjs";

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Virheellinen pyyntö");
  }
}

export function handleError(e) {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error(e);
  return json({ error: "Jotain meni pieleen. Yritä hetken päästä uudelleen." }, 500);
}
