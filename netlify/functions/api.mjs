// Julkinen varausrajapinta: /api/settings, /api/slots, /api/book, /api/booking, /api/cancel
import {
  HttpError, getSettings, availableSlots, createBooking, getBookingByToken,
  canCustomerCancel, cancelBooking,
} from "../lib/booking.mjs";
import { publicSettings } from "../lib/settings.mjs";
import { confirmationEmail, ownerNotice, cancellationEmail, sendEmail, emailConfigured } from "../lib/email.mjs";
import { isDemoMode } from "../lib/auth.mjs";
import { json, readJson, handleError } from "../lib/http.mjs";

const publicBooking = (b, settings) => ({
  date: b.date, time: b.time, end: b.end, serviceName: b.serviceName, price: b.price,
  name: b.name, status: b.status, canCancel: canCustomerCancel(settings, b),
  cancelCutoffHours: settings.cancelCutoffHours, phone: settings.business.phone,
});

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  try {
    if (req.method === "GET" && route === "settings") {
      const s = await getSettings();
      return json({ ...publicSettings(s), demo: { email: !emailConfigured(), admin: isDemoMode() } });
    }

    if (req.method === "GET" && route === "slots") {
      const s = await getSettings();
      const { closed, slots } = await availableSlots(s, url.searchParams.get("date") || "", url.searchParams.get("service") || "");
      return json({ closed, slots });
    }

    if (req.method === "POST" && route === "book") {
      const body = await readJson(req);
      const { booking, settings } = await createBooking(body);
      const origin = url.origin;
      const cancelUrl = `${origin}/peru?t=${booking.token}`;
      const [customer] = await Promise.all([
        sendEmail(confirmationEmail(settings.business, booking, cancelUrl, settings.cancelCutoffHours)),
        sendEmail(ownerNotice(settings.business, booking, `${origin}/hallinta`)),
      ]);
      return json({
        ok: true,
        booking: publicBooking(booking, settings),
        email: customer.sent ? "sent" : customer.error ? "failed" : "demo",
        // Demotilassa näytetään, millaisen viestin asiakas saisi.
        preview: customer.preview || null,
        cancelUrl: customer.preview ? cancelUrl : null,
      }, 201);
    }

    if (req.method === "GET" && route === "booking") {
      const b = await getBookingByToken(url.searchParams.get("t"));
      if (!b) throw new HttpError(404, "Varausta ei löytynyt. Tarkista linkki.");
      return json(publicBooking(b, await getSettings()));
    }

    if (req.method === "POST" && route === "cancel") {
      const { t } = await readJson(req);
      const b = await getBookingByToken(t);
      if (!b) throw new HttpError(404, "Varausta ei löytynyt. Tarkista linkki.");
      const settings = await getSettings();
      if (b.status === "cancelled") return json(publicBooking(b, settings));
      if (!canCustomerCancel(settings, b)) {
        throw new HttpError(400, `Aikaa ei voi enää perua verkossa. Soita ${settings.business.phone}.`);
      }
      const cancelled = await cancelBooking(b, "customer");
      const mail = await sendEmail(cancellationEmail(settings.business, cancelled, false));
      return json({ ...publicBooking(cancelled, settings), email: mail.sent ? "sent" : mail.error ? "failed" : "demo" });
    }

    return json({ error: "Ei löytynyt" }, 404);
  } catch (e) {
    return handleError(e);
  }
};

export const config = {
  path: ["/api/settings", "/api/slots", "/api/book", "/api/booking", "/api/cancel"],
};
