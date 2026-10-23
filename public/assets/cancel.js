// Peruutussivu: /peru?t=<tunniste>
(async () => {
  const { esc, api, fiDateLong } = window.K;
  const root = document.querySelector("[data-cancel-root]");
  const t = new URLSearchParams(location.search).get("t");

  const render = (b, note = "") => {
    const status = b.status === "cancelled"
      ? '<div class="notice info">Tämä varaus on peruttu.</div>'
      : b.canCancel
        ? `<p class="muted">Voit perua ajan verkossa viimeistään ${b.cancelCutoffHours} tuntia ennen.</p>
           <button class="btn btn-danger" data-do-cancel>Peru varaus</button>`
        : `<div class="notice info">Aikaa ei voi enää perua verkossa. Soita ${esc(b.phone)}.</div>`;
    root.innerHTML = `
      <h2>${b.status === "cancelled" ? "Peruttu varaus" : "Varauksesi on voimassa"}</h2>
      <dl class="summary">
        <dt>Palvelu</dt><dd>${esc(b.serviceName)}</dd>
        <dt>Aika</dt><dd>${fiDateLong(b.date)} klo ${b.time}–${b.end}</dd>
        <dt>Hinta</dt><dd>${esc(b.price)} €</dd>
        <dt>Nimi</dt><dd>${esc(b.name)}</dd>
      </dl>
      ${note}${status}
      ${b.status === "cancelled" ? '<p style="margin-top:16px"><a class="btn" href="/varaa">Varaa uusi aika</a></p>' : ""}`;
  };

  if (!t) {
    root.innerHTML = '<div class="notice error">Linkistä puuttuu varauksen tunniste. Avaa linkki uudelleen vahvistusviestistä.</div>';
    return;
  }
  try {
    render(await api(`/api/booking?t=${encodeURIComponent(t)}`));
  } catch (err) {
    root.innerHTML = `<div class="notice error">${esc(err.message)}</div>`;
    return;
  }

  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-do-cancel]");
    if (!btn) return;
    if (!confirm("Perutaanko varaus?")) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Perutaan…';
    try {
      const r = await api("/api/cancel", { method: "POST", body: { t } });
      const note = r.email === "sent" ? " Vahvistus peruutuksesta lähetettiin sähköpostiisi." : r.email === "demo" ? " (Demotilassa sähköpostia ei lähetetä.)" : "";
      render(r, `<div class="notice ok">Varaus peruttu.${note}</div>`);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Peru varaus";
      root.insertAdjacentHTML("beforeend", `<div class="notice error">${esc(err.message)}</div>`);
    }
  });
})();
