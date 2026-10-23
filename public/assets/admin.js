// Yrittäjän hallintanäkymä: varaukset, aukioloajat, aikojen sulkeminen ja palvelut.
(async () => {
  const { esc, api, today, addDays, weekday, fiDate, fiDateLong, WD_LONG } = window.K;
  const root = document.getElementById("admin-root");
  const store = {
    get: () => { try { return sessionStorage.getItem("kuura-admin") || ""; } catch { return ""; } },
    set: (v) => { try { v ? sessionStorage.setItem("kuura-admin", v) : sessionStorage.removeItem("kuura-admin"); } catch {} },
  };
  let token = store.get();
  let demo = false;
  try { demo = (await api("/api/settings")).demo.admin; } catch {}

  const call = async (path, opts = {}) => {
    try {
      return await api(path, { ...opts, token });
    } catch (err) {
      if (err.status === 401) { token = ""; store.set(""); renderLogin("Istunto vanheni, kirjaudu uudelleen."); }
      throw err;
    }
  };
  const flash = (el, kind, text) => { el.innerHTML = `<div class="notice ${kind}">${esc(text)}</div>`; };
  const emailNote = (s) => (s === "sent" ? "Asiakkaalle lähetettiin sähköposti." : s === "demo" ? "Demotilassa sähköpostia ei lähetetä." : s === "failed" ? "Sähköpostin lähetys epäonnistui." : "");
  const mondayOf = (d) => addDays(d, -((weekday(d) + 6) % 7));

  // ---------- Kirjautuminen ----------
  function renderLogin(msg = "") {
    root.innerHTML = `
      <form class="panel" style="max-width:420px" data-login>
        <h2>Kirjaudu</h2>
        ${msg ? `<div class="notice info">${esc(msg)}</div>` : ""}
        ${demo ? `<div class="notice info">Demotila: salasana on <strong>kuura-demo</strong>. Oikealla asiakkaalla salasana asetetaan Netlifyssä.</div>` : ""}
        <label class="field">Salasana<input type="password" name="password" autocomplete="current-password" required></label>
        <div data-login-error></div>
        <p style="margin-top:16px"><button class="btn" type="submit">Kirjaudu</button></p>
      </form>`;
    const form = root.querySelector("[data-login]");
    form.password.focus();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const r = await api("/api/admin-login", { method: "POST", body: { password: form.password.value } });
        token = r.token;
        store.set(token);
        renderApp();
      } catch (err) {
        flash(form.querySelector("[data-login-error]"), "error", err.message);
      }
    });
  }

  // ---------- Runko ----------
  const tabs = [["bookings", "Varaukset"], ["block", "Sulje aika"], ["hours", "Aukioloajat"], ["services", "Palvelut"]];
  let current = "bookings";

  function renderApp() {
    root.innerHTML = `
      <div class="admin-bar">
        <div class="tabs" role="tablist">${tabs.map(([id, label]) => `<button role="tab" data-tab="${id}" aria-selected="${id === current}">${label}</button>`).join("")}</div>
        <button class="btn btn-quiet btn-small" data-logout>Kirjaudu ulos</button>
      </div>
      <div data-view></div>`;
    root.querySelector(".tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tab]");
      if (!b) return;
      current = b.dataset.tab;
      root.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      show();
    });
    root.querySelector("[data-logout]").addEventListener("click", () => { token = ""; store.set(""); renderLogin(); });
    show();
  }
  const view = () => root.querySelector("[data-view]");
  const show = () => ({ bookings: viewBookings, block: viewBlock, hours: viewHours, services: viewServices })[current]();

  // ---------- Varaukset ----------
  let weekStart = mondayOf(today());
  let showCancelled = false;

  async function viewBookings() {
    const end = addDays(weekStart, 6);
    view().innerHTML = `
      <div class="week-nav">
        <button class="btn btn-quiet btn-small" data-week="-7" aria-label="Edellinen viikko">‹ Edellinen</button>
        <strong>${fiDate(weekStart)} – ${fiDate(end)}</strong>
        <button class="btn btn-quiet btn-small" data-week="7" aria-label="Seuraava viikko">Seuraava ›</button>
        <button class="btn btn-quiet btn-small" data-week="0">Tämä viikko</button>
        <label class="check"><input type="checkbox" data-show-cancelled ${showCancelled ? "checked" : ""}> Näytä perutut</label>
      </div>
      <div data-msg></div>
      <div data-list><p class="muted"><span class="spinner"></span> Ladataan…</p></div>`;
    view().querySelector(".week-nav").addEventListener("click", (e) => {
      const b = e.target.closest("[data-week]");
      if (!b) return;
      const n = Number(b.dataset.week);
      weekStart = n === 0 ? mondayOf(today()) : addDays(weekStart, n);
      viewBookings();
    });
    view().querySelector("[data-show-cancelled]").addEventListener("change", (e) => { showCancelled = e.target.checked; viewBookings(); });

    let data;
    try {
      data = await call(`/api/admin/bookings?from=${weekStart}&to=${end}`);
    } catch (err) {
      if (err.status !== 401) flash(view().querySelector("[data-list]"), "error", err.message);
      return;
    }
    const list = view().querySelector("[data-list]");
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const active = data.bookings.filter((b) => b.status === "confirmed").length;
    list.innerHTML = `<p class="muted">${active} varausta tällä viikolla.</p>` + days.map((d) => {
      const items = [
        ...data.bookings.filter((b) => b.date === d && (showCancelled || b.status !== "cancelled")).map((b) => ({ t: b.time, html: bookingRow(b) })),
        ...data.blocks.filter((b) => b.date === d).map((b) => ({ t: b.start, html: blockRow(b) })),
      ].sort((a, b) => a.t.localeCompare(b.t));
      return `<section class="admin-day${d === today() ? " is-today" : ""}">
        <h3>${fiDateLong(d)}${d === today() ? " · tänään" : ""}</h3>
        ${items.length ? items.map((x) => x.html).join("") : '<p class="muted empty-day">Ei varauksia.</p>'}
      </section>`;
    }).join("");
  }

  function bookingRow(b) {
    const cancelled = b.status === "cancelled";
    return `<article class="booking-row${cancelled ? " is-cancelled" : ""}" data-id="${esc(b.id)}" data-date="${esc(b.date)}">
      <div class="when">${esc(b.time)}<span>${esc(b.end)}</span></div>
      <div class="who">
        <strong>${esc(b.name)}</strong> <span class="muted">${esc(b.serviceName)}, ${esc(b.price)} €</span>
        ${cancelled ? `<span class="badge">Peruttu${b.cancelledBy === "customer" ? " (asiakas)" : ""}</span>` : ""}
        ${b.status === "pending" ? '<span class="badge">Kesken</span>' : ""}
        <div class="contact"><a href="tel:${esc(b.phone.replace(/\s/g, ""))}">${esc(b.phone)}</a> <a href="mailto:${esc(b.email)}">${esc(b.email)}</a></div>
        ${b.note ? `<p class="note">${esc(b.note)}</p>` : ""}
        ${b.movedFrom ? `<p class="muted small">Siirretty ajasta ${fiDate(b.movedFrom.date)} klo ${esc(b.movedFrom.time)}</p>` : ""}
        <div data-row-extra></div>
      </div>
      ${cancelled ? "" : `<div class="actions"><button class="btn btn-quiet btn-small" data-move>Siirrä</button><button class="btn btn-danger btn-small" data-cancel>Peru</button></div>`}
    </article>`;
  }

  function blockRow(b) {
    return `<article class="booking-row is-block" data-block-id="${esc(b.id)}" data-date="${esc(b.date)}">
      <div class="when">${esc(b.start)}<span>${esc(b.end)}</span></div>
      <div class="who"><strong>Suljettu</strong> <span class="muted">${esc(b.reason || "")}</span></div>
      <div class="actions"><button class="btn btn-quiet btn-small" data-unblock>Avaa aika</button></div>
    </article>`;
  }

  root.addEventListener("click", async (e) => {
    const row = e.target.closest(".booking-row");
    if (!row) return;
    const msg = view().querySelector("[data-msg]");
    const { id, date, blockId } = row.dataset;

    if (e.target.closest("[data-cancel]")) {
      if (!confirm("Perutaanko varaus? Asiakkaalle lähetetään ilmoitus sähköpostiin.")) return;
      try {
        const r = await call("/api/admin/cancel", { method: "POST", body: { date, id } });
        await viewBookings();
        flash(view().querySelector("[data-msg]"), "ok", `Varaus peruttu. ${emailNote(r.email)}`);
      } catch (err) { if (msg) flash(msg, "error", err.message); }
    }

    if (e.target.closest("[data-unblock]")) {
      try {
        await call("/api/admin/unblock", { method: "POST", body: { date, id: blockId } });
        await viewBookings();
        flash(view().querySelector("[data-msg]"), "ok", "Aika avattiin varattavaksi.");
      } catch (err) { if (msg) flash(msg, "error", err.message); }
    }

    if (e.target.closest("[data-move]")) {
      const extra = row.querySelector("[data-row-extra]");
      extra.innerHTML = `<div class="move-box">
        <label class="field">Uusi päivä<input type="date" value="${date}" min="${today()}" data-move-date></label>
        <div data-move-slots class="slot-grid"></div>
        <p style="margin-top:8px"><button class="btn btn-quiet btn-small" data-move-close>Sulje</button></p>
      </div>`;
      const load = async () => {
        const nd = extra.querySelector("[data-move-date]").value;
        const box = extra.querySelector("[data-move-slots]");
        box.innerHTML = '<span class="spinner"></span>';
        try {
          const r = await call(`/api/admin/slots?date=${date}&id=${id}&newDate=${nd}`);
          box.innerHTML = r.closed ? `<p class="muted">${esc(r.closed)}</p>` : r.slots.length
            ? r.slots.map((t) => `<button type="button" data-move-to="${t}">${t}</button>`).join("")
            : '<p class="muted">Ei vapaita aikoja.</p>';
        } catch (err) { box.innerHTML = `<div class="notice error">${esc(err.message)}</div>`; }
      };
      extra.querySelector("[data-move-date]").addEventListener("change", load);
      load();
    }

    if (e.target.closest("[data-move-close]")) row.querySelector("[data-row-extra]").innerHTML = "";

    const to = e.target.closest("[data-move-to]");
    if (to) {
      const nd = row.querySelector("[data-move-date]").value;
      if (!confirm(`Siirretäänkö varaus aikaan ${fiDateLong(nd)} klo ${to.dataset.moveTo}?`)) return;
      try {
        const r = await call("/api/admin/move", { method: "POST", body: { date, id, newDate: nd, newTime: to.dataset.moveTo } });
        await viewBookings();
        flash(view().querySelector("[data-msg]"), "ok", `Varaus siirretty. ${emailNote(r.email)}`);
      } catch (err) { if (msg) flash(msg, "error", err.message); }
    }
  });

  // ---------- Sulje aika ----------
  function viewBlock() {
    view().innerHTML = `
      <form class="panel" data-block-form style="max-width:560px">
        <h2>Sulje aika</h2>
        <p class="muted">Esimerkiksi lounas, koulutus tai lääkärikäynti. Suljettuja aikoja ei voi varata. Koko päivän voit sulkea Aukioloajat-välilehdeltä.</p>
        <div class="form-grid">
          <label class="field full">Päivä<input type="date" name="date" value="${today()}" min="${today()}" required></label>
          <label class="field">Alkaen<input type="time" name="start" value="12:00" step="1800" required></label>
          <label class="field">Asti<input type="time" name="end" value="12:30" step="1800" required></label>
          <label class="field full">Syy <span class="hint">Näkyy vain sinulle.</span><input name="reason" maxlength="80" placeholder="Lounas"></label>
        </div>
        <div data-msg></div>
        <p style="margin-top:16px"><button class="btn" type="submit">Sulje aika</button></p>
      </form>`;
    const form = view().querySelector("[data-block-form]");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = form.querySelector("[data-msg]");
      try {
        const r = await call("/api/admin/block", { method: "POST", body: { date: form.date.value, start: form.start.value, end: form.end.value, reason: form.reason.value } });
        flash(msg, "ok", `Suljettu ${fiDateLong(r.block.date)} klo ${r.block.start}–${r.block.end}. Voit avata ajan Varaukset-näkymästä.`);
      } catch (err) { flash(msg, "error", err.message); }
    });
  }

  // ---------- Aukioloajat ----------
  async function viewHours() {
    view().innerHTML = '<p class="muted"><span class="spinner"></span> Ladataan…</p>';
    let s;
    try { s = await call("/api/admin/settings"); } catch (err) { if (err.status !== 401) flash(view(), "error", err.message); return; }
    const order = [1, 2, 3, 4, 5, 6, 0];
    const futureClosed = s.closedDates.filter((d) => d >= today());
    view().innerHTML = `
      <form class="panel" data-hours-form>
        <h2>Aukioloajat</h2>
        <div class="hours-edit">
          ${order.map((d) => { const h = s.hours[d]; return `
            <div class="hours-row" data-day="${d}">
              <label class="check"><input type="checkbox" name="open-${d}" ${h ? "checked" : ""}> ${WD_LONG[d]}</label>
              <input type="time" step="1800" name="from-${d}" value="${h ? h.open : "09:00"}" aria-label="${WD_LONG[d]} alkaen" ${h ? "" : "disabled"}>
              <span>–</span>
              <input type="time" step="1800" name="to-${d}" value="${h ? h.close : "17:00"}" aria-label="${WD_LONG[d]} asti" ${h ? "" : "disabled"}>
            </div>`; }).join("")}
        </div>

        <h2 style="margin-top:28px">Suljetut päivät</h2>
        <p class="muted">Loma, pyhät tai sairastuminen. Jo tehdyt varaukset näille päiville eivät peru itsestään: tarkista ne Varaukset-näkymästä.</p>
        <div class="closed-add"><input type="date" min="${today()}" data-closed-input aria-label="Suljettava päivä"><button type="button" class="btn btn-quiet btn-small" data-closed-add>Lisää</button></div>
        <ul class="closed-list" data-closed-list>${futureClosed.map((d) => closedItem(d)).join("") || '<li class="muted">Ei suljettuja päiviä.</li>'}</ul>

        <h2 style="margin-top:28px">Varaussäännöt</h2>
        <div class="form-grid">
          <label class="field">Varaus viimeistään (min ennen)<input type="number" name="minNoticeMinutes" min="0" max="2880" value="${s.minNoticeMinutes}"></label>
          <label class="field">Varattavissa päivää eteenpäin<input type="number" name="maxDaysAhead" min="1" max="365" value="${s.maxDaysAhead}"></label>
          <label class="field">Asiakas voi perua (h ennen)<input type="number" name="cancelCutoffHours" min="0" max="168" value="${s.cancelCutoffHours}"></label>
        </div>
        <div data-msg></div>
        <p style="margin-top:16px"><button class="btn" type="submit">Tallenna muutokset</button></p>
      </form>`;
    const form = view().querySelector("[data-hours-form]");
    let closed = [...s.closedDates];
    const list = form.querySelector("[data-closed-list]");
    const redraw = () => { const f = closed.filter((d) => d >= today()).sort(); list.innerHTML = f.map(closedItem).join("") || '<li class="muted">Ei suljettuja päiviä.</li>'; };

    form.addEventListener("change", (e) => {
      const m = e.target.name?.match(/^open-(\d)$/);
      if (m) form.querySelectorAll(`[name="from-${m[1]}"], [name="to-${m[1]}"]`).forEach((i) => (i.disabled = !e.target.checked));
    });
    form.querySelector("[data-closed-add]").addEventListener("click", () => {
      const v = form.querySelector("[data-closed-input]").value;
      if (v && !closed.includes(v)) { closed.push(v); redraw(); }
    });
    list.addEventListener("click", (e) => {
      const b = e.target.closest("[data-remove-closed]");
      if (b) { closed = closed.filter((d) => d !== b.dataset.removeClosed); redraw(); }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const hours = {};
      for (const d of order) hours[d] = form[`open-${d}`].checked ? { open: form[`from-${d}`].value, close: form[`to-${d}`].value } : null;
      const body = { ...s, hours, closedDates: closed, minNoticeMinutes: Number(form.minNoticeMinutes.value), maxDaysAhead: Number(form.maxDaysAhead.value), cancelCutoffHours: Number(form.cancelCutoffHours.value) };
      const msg = form.querySelector("[data-msg]");
      try { s = await call("/api/admin/settings", { method: "PUT", body }); flash(msg, "ok", "Tallennettu. Muutokset näkyvät varaussivulla heti."); }
      catch (err) { flash(msg, "error", err.message); }
    });
  }
  const closedItem = (d) => `<li>${fiDateLong(d)} <button type="button" class="btn btn-quiet btn-small" data-remove-closed="${d}" aria-label="Poista ${fiDate(d)}">Poista</button></li>`;

  // ---------- Palvelut ----------
  async function viewServices() {
    view().innerHTML = '<p class="muted"><span class="spinner"></span> Ladataan…</p>';
    let s;
    try { s = await call("/api/admin/settings"); } catch (err) { if (err.status !== 401) flash(view(), "error", err.message); return; }
    const row = (sv = { id: "", name: "", duration: 30, price: 0, desc: "" }) => `
      <fieldset class="service-edit" data-sid="${esc(sv.id)}">
        <legend class="visually-hidden">Palvelu</legend>
        <label class="field">Nimi<input name="name" value="${esc(sv.name)}" maxlength="60" required></label>
        <label class="field">Kesto (min)<input name="duration" type="number" min="15" max="480" step="15" value="${sv.duration}"></label>
        <label class="field">Hinta (€)<input name="price" type="number" min="0" step="0.5" value="${sv.price}"></label>
        <label class="field wide">Kuvaus<input name="desc" value="${esc(sv.desc)}" maxlength="160"></label>
        <button type="button" class="btn btn-quiet btn-small" data-remove-service>Poista</button>
      </fieldset>`;
    view().innerHTML = `
      <form class="panel" data-services-form>
        <h2>Palvelut ja hinnat</h2>
        <p class="muted">Kesto määrää, kuinka pitkän ajan varaus vie kalenterista. Muutokset eivät koske jo tehtyjä varauksia.</p>
        <div data-rows>${s.services.map(row).join("")}</div>
        <p><button type="button" class="btn btn-quiet btn-small" data-add-service>Lisää palvelu</button></p>
        <div data-msg></div>
        <p style="margin-top:16px"><button class="btn" type="submit">Tallenna palvelut</button></p>
      </form>`;
    const form = view().querySelector("[data-services-form]");
    const rows = form.querySelector("[data-rows]");
    form.querySelector("[data-add-service]").addEventListener("click", () => { rows.insertAdjacentHTML("beforeend", row()); rows.lastElementChild.querySelector("input").focus(); });
    rows.addEventListener("click", (e) => { if (e.target.closest("[data-remove-service]")) e.target.closest("fieldset").remove(); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const services = [...rows.querySelectorAll("fieldset")].map((f) => ({
        id: f.dataset.sid, name: f.querySelector('[name="name"]').value, duration: Number(f.querySelector('[name="duration"]').value),
        price: Number(f.querySelector('[name="price"]').value), desc: f.querySelector('[name="desc"]').value,
      }));
      const msg = form.querySelector("[data-msg]");
      try {
        s = await call("/api/admin/settings", { method: "PUT", body: { ...s, services } });
        rows.innerHTML = s.services.map(row).join("");
        flash(msg, "ok", "Palvelut tallennettu.");
      } catch (err) { flash(msg, "error", err.message); }
    });
  }

  token ? renderApp() : renderLogin();
})();
