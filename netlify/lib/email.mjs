import { formatDateFi } from "./time.mjs";

// Sähköpostit lähetetään Resendin kautta (https://resend.com), jos
// ympäristömuuttujat RESEND_API_KEY ja EMAIL_FROM on asetettu Netlifyssä.
// Ilman niitä sivu toimii demotilassa: viestiä ei lähetetä, vaan sen
// sisältö palautetaan selaimelle esikatseltavaksi.

const env = (k) => (globalThis.Netlify?.env?.get(k) ?? process.env[k] ?? "").trim();

export const emailConfigured = () => Boolean(env("RESEND_API_KEY") && env("EMAIL_FROM"));

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function layout(business, title, rows, footerHtml = "") {
  const rowHtml = rows
    .map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#5f7a70;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;color:#16302b"><strong>${esc(v)}</strong></td></tr>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#e6edef;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fbfcfc;border-radius:14px;border:1px solid #c9d5d6">
<tr><td style="padding:28px 28px 8px"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#c4302a">${esc(business.name)}</div>
<h1 style="margin:10px 0 0;font-size:22px;color:#16302b">${esc(title)}</h1></td></tr>
<tr><td style="padding:12px 28px"><table role="presentation" style="font-size:15px">${rowHtml}</table></td></tr>
<tr><td style="padding:8px 28px 28px;font-size:14px;line-height:1.55;color:#24443d">${footerHtml}
<p style="margin:18px 0 0;color:#5f7a70">${esc(business.name)} · ${esc(business.address)} · ${esc(business.phone)}</p></td></tr>
</table></td></tr></table></body></html>`;
}

function detailRows(b) {
  return [
    ["Palvelu", b.serviceName],
    ["Aika", `${formatDateFi(b.date)} klo ${b.time}–${b.end}`],
    ["Hinta", `${b.price} €`],
    ["Nimi", b.name],
  ];
}

export function confirmationEmail(business, b, cancelUrl, cutoffHours) {
  const footer = `<p style="margin:0">Tervetuloa! Jos tulee este, voit perua ajan itse viimeistään ${cutoffHours} tuntia ennen:</p>
<p style="margin:14px 0"><a href="${esc(cancelUrl)}" style="display:inline-block;background:#16302b;color:#fbfcfc;text-decoration:none;padding:11px 18px;border-radius:999px">Peru tai tarkista varaus</a></p>
<p style="margin:0">Myöhemmin peruttaessa soita numeroon ${esc(business.phone)}.</p>`;
  return {
    to: b.email,
    subject: `Varausvahvistus: ${b.serviceName} ${formatDateFi(b.date).toLowerCase()} klo ${b.time}`,
    html: layout(business, "Varauksesi on vahvistettu", detailRows(b), footer),
    text: `Varauksesi on vahvistettu.\n\n${b.serviceName}\n${formatDateFi(b.date)} klo ${b.time}–${b.end}\n${b.price} €\n\nPeru tai tarkista varaus: ${cancelUrl}\n\n${business.name}, ${business.address}, ${business.phone}`,
  };
}

export function ownerNotice(business, b, adminUrl) {
  const rows = [...detailRows(b), ["Puhelin", b.phone], ["Sähköposti", b.email]];
  if (b.note) rows.push(["Lisätieto", b.note]);
  return {
    to: env("OWNER_EMAIL") || business.email,
    subject: `Uusi varaus: ${b.name}, ${b.date} klo ${b.time}`,
    html: layout(business, "Uusi varaus", rows, `<p style="margin:0"><a href="${esc(adminUrl)}">Avaa hallinta</a></p>`),
    text: `Uusi varaus\n${b.serviceName}\n${b.date} klo ${b.time}\n${b.name}, ${b.phone}, ${b.email}\n${b.note || ""}`,
  };
}

export function cancellationEmail(business, b, byOwner) {
  const footer = byOwner
    ? `<p style="margin:0">Pahoittelemme, joudumme perumaan tämän ajan. Varaa halutessasi uusi aika verkkosivuiltamme tai soita ${esc(business.phone)}.</p>`
    : `<p style="margin:0">Peruutuksesi on kirjattu. Tervetuloa toiste!</p>`;
  return {
    to: b.email,
    subject: `Varaus peruttu: ${b.serviceName} ${b.date} klo ${b.time}`,
    html: layout(business, "Varaus on peruttu", detailRows(b), footer),
    text: `Varaus on peruttu.\n${b.serviceName}\n${formatDateFi(b.date)} klo ${b.time}\n\n${business.name}, ${business.phone}`,
  };
}

export function movedEmail(business, b, cancelUrl) {
  const footer = `<p style="margin:0">Aikasi on siirretty. Aiempi aika: ${esc(formatDateFi(b.movedFrom.date))} klo ${esc(b.movedFrom.time)}.</p>
<p style="margin:14px 0"><a href="${esc(cancelUrl)}" style="display:inline-block;background:#16302b;color:#fbfcfc;text-decoration:none;padding:11px 18px;border-radius:999px">Tarkista varaus</a></p>`;
  return {
    to: b.email,
    subject: `Aikasi on siirretty: ${b.date} klo ${b.time}`,
    html: layout(business, "Uusi aika varauksellesi", detailRows(b), footer),
    text: `Aikasi on siirretty.\nUusi aika: ${formatDateFi(b.date)} klo ${b.time}\n\nTarkista varaus: ${cancelUrl}`,
  };
}

// Lähettää viestin. Palauttaa { sent: true } tai demotilassa { sent: false, preview }.
export async function sendEmail(msg) {
  if (!emailConfigured()) return { sent: false, preview: { to: msg.to, subject: msg.subject, html: msg.html } };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env("EMAIL_FROM"), to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) {
      console.error("Sähköpostin lähetys epäonnistui", res.status, await res.text());
      return { sent: false, error: true };
    }
    return { sent: true };
  } catch (e) {
    console.error("Sähköpostin lähetys epäonnistui", e);
    return { sent: false, error: true };
  }
}
