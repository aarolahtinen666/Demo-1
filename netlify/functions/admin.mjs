// Yrittäjän hallinta-API, vaatii kirjautumisen (Authorization: Bearer <token>).
import {
  HttpError, getSettings, saveSettings, listBookings, getBooking, cancelBooking,
  moveBooking, availableSlots, addBlock, removeBlock,
} from "../lib/booking.mjs";
import { cancellationEmail, movedEmail, sendEmail } from "../lib/email.mjs";
import { verifyRequest } from "../lib/auth.mjs";
import { helsinkiNow } from "../lib/time.mjs";
import { json, readJson, handleError } from "../lib/http.mjs";

const emailStatus = (r) => (r.sent ? "sent" : r.error ? "failed" : "demo");

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/admin\//, "").replace(/\/$/, "");
  try {
    if (!verifyRequest(req)) return json({ error: "Kirjaudu uudelleen" }, 401);
    const q = (k) => url.searchParams.get(k) || "";

    if (req.method === "GET" && route === "bookings") {
      return json(await listBookings(q("from"), q("to")));
    }

    if (req.method === "GET" && route === "slots") {
      // Siirtoa varten: vapaat ajat varauksen kestolla, varauksen omat jaksot vapaina.
      const settings = await getSettings();
      const b = await getBooking(q("date"), q("id"));
      if (!b) throw new HttpError(404, "Varausta ei löytynyt");
      const tmp = { ...settings, services: [{ id: "__move", duration: b.duration }] };
      const res = await availableSlots(tmp, q("newDate"), "__move", {
        ignoreBookingId: b.id, now: { date: helsinkiNow().date, minutes: -1e9 },
      });
      return json({ closed: res.closed, slots: res.slots });
    }

    if (req.method === "POST" && route === "cancel") {
      const { date, id, notify = true } = await readJson(req);
      const b = await getBooking(date, id);
      if (!b) throw new HttpError(404, "Varausta ei löytynyt");
      const settings = await getSettings();
      const cancelled = await cancelBooking(b, "owner");
      const mail = notify ? await sendEmail(cancellationEmail(settings.business, cancelled, true)) : { sent: false };
      return json({ booking: cancelled, email: notify ? emailStatus(mail) : "skipped" });
    }

    if (req.method === "POST" && route === "move") {
      const { date, id, newDate, newTime } = await readJson(req);
      const b = await getBooking(date, id);
      if (!b) throw new HttpError(404, "Varausta ei löytynyt");
      const settings = await getSettings();
      const moved = await moveBooking(b, newDate, newTime);
      const mail = await sendEmail(movedEmail(settings.business, moved, `${url.origin}/peru?t=${moved.token}`));
      return json({ booking: moved, email: emailStatus(mail) });
    }

    if (req.method === "POST" && route === "block") {
      return json({ block: await addBlock(await readJson(req)) }, 201);
    }

    if (req.method === "POST" && route === "unblock") {
      const { date, id } = await readJson(req);
      return json({ block: await removeBlock(date, id) });
    }

    if (req.method === "GET" && route === "settings") {
      return json(await getSettings());
    }

    if (req.method === "PUT" && route === "settings") {
      return json(await saveSettings(await readJson(req)));
    }

    return json({ error: "Ei löytynyt" }, 404);
  } catch (e) {
    return handleError(e);
  }
};

export const config = { path: "/api/admin/*" };
