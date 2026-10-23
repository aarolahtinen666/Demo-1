// Varaussivu: palvelu -> päivä ja aika -> yhteystiedot -> vahvistus
(async () => {
  const { esc, settings, api, today, addDays, weekday, fiDateLong, WD, nowMinutes } = window.K;
  const $ = (sel) => document.querySelector(sel);
  const panels = { service: $('[data-panel="service"]'), time: $('[data-panel="time"]'), details: $('[data-panel="details"]'), done: $('[data-panel="done"]') };
  const state = { service: null, date: null, time: null };
  let s;

  try {
    s = await settings();
  } catch {
    $("[data-services]").innerHTML = '<div class="notice error">Varausjärjestelmään ei saatu yhteyttä. Päivitä sivu tai soita meille.</div>';
    return;
  }

  function setStep(n) {
    document.querySelectorAll(".steps li").forEach((li) => {
      const k = Number(li.dataset.step);
      li.classList.toggle("active", k === n);
      li.classList.toggle("done", k < n);
    });
  }
  const scrollTo = (el) => el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });

  // 1. Palvelut
  $("[data-services]").innerHTML = s.services.map((sv) => `
    <label class="service-option">
      <input type="radio" name="service" value="${esc(sv.id)}">
      <span class="name">${esc(sv.name)}</span>
      <span class="meta">${sv.duration} min${sv.desc ? ` · ${esc(sv.desc)}` : ""}</span>
      <span class="price">${esc(sv.price)} €</span>
    </label>`).join("");

  $("[data-services]").addEventListener("change", (e) => {
    state.service = s.services.find((x) => x.id === e.target.value);
    state.time = null;
    panels.time.hidden = false;
    panels.details.hidden = true;
    setStep(2);
    renderDays();
    scrollTo(panels.time);
  });

  // 2. Päivät ja ajat
  const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  // Avoinna-tieto päivälle. Tänään lasketaan suljetuksi, jos viimeinenkään aika ei enää ehdi.
  const isOpen = (d) => {
    const h = s.hours[weekday(d)];
    if (!h || s.closedDates.includes(d)) return false;
    if (d === today()) return nowMinutes() + s.minNoticeMinutes + s.slotMinutes <= toMin(h.close);
    return true;
  };
  async function renderDays() {
    const start = today();
    const n = Math.min(s.maxDaysAhead + 1, 42);
    const days = Array.from({ length: n }, (_, i) => addDays(start, i));
    const auto = !state.date || !isOpen(state.date);
    if (auto) state.date = days.find(isOpen) || null;
    drawDays(days, start);
    let count = await loadSlots();
    // Automaattisesti valittu päivä täynnä: siirrytään seuraavaan päivään, jolla on vapaata.
    for (let i = 0; auto && count === 0 && i < 14; i++) {
      const next = days.slice(days.indexOf(state.date) + 1).find(isOpen);
      if (!next) break;
      state.date = next;
      drawDays(days, start);
      count = await loadSlots();
    }
  }
  function drawDays(days, start) {
    $("[data-days]").innerHTML = days.map((d) => {
      const [, m, dd] = d.split("-").map(Number);
      return `<button type="button" data-date="${d}" aria-pressed="${d === state.date}" ${isOpen(d) ? "" : "disabled"} aria-label="${fiDateLong(d)}${isOpen(d) ? "" : ", suljettu"}">
        <span class="wd">${d === start ? "tänään" : WD[weekday(d)]}</span><span class="d">${dd}</span><span class="m">${m}.</span></button>`;
    }).join("");
    const strip = $("[data-days]");
    const sel = $(`[data-date="${state.date}"]`);
    if (sel) strip.scrollLeft = sel.offsetLeft - strip.offsetLeft - 8;
  }

  $("[data-days]").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-date]");
    if (!b || b.disabled) return;
    state.date = b.dataset.date;
    state.time = null;
    document.querySelectorAll("[data-days] button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    panels.details.hidden = true;
    setStep(2);
    loadSlots();
  });

  let slotReq = 0;
  async function loadSlots() {
    const box = $("[data-slots]");
    if (!state.date) { box.innerHTML = '<p class="slot-note">Ei avoimia päiviä lähiaikoina.</p>'; return 0; }
    const my = ++slotReq;
    box.innerHTML = `<p class="slot-note"><span class="spinner"></span> Haetaan vapaita aikoja…</p>`;
    try {
      const r = await api(`/api/slots?date=${state.date}&service=${encodeURIComponent(state.service.id)}`);
      if (my !== slotReq) return -1;
      if (r.closed) { box.innerHTML = `<p class="slot-note">${esc(r.closed)}.</p>`; return 0; }
      if (!r.slots.length) { box.innerHTML = `<p class="slot-note">${fiDateLong(state.date)} on täynnä. Valitse toinen päivä.</p>`; return 0; }
      box.innerHTML = `<p class="slot-note">${fiDateLong(state.date)}, ${r.slots.length} vapaata aikaa</p>
        <div class="slot-grid" role="group" aria-label="Kellonaika">${r.slots.map((t) => `<button type="button" data-time="${t}" aria-pressed="${t === state.time}">${t}</button>`).join("")}</div>`;
      return r.slots.length;
    } catch (err) {
      if (my === slotReq) box.innerHTML = `<div class="notice error">${esc(err.message)}</div>`;
      return -1;
    }
  }

  $("[data-slots]").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-time]");
    if (!b) return;
    state.time = b.dataset.time;
    document.querySelectorAll("[data-slots] button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    showDetails();
  });

  function summaryHtml(svc, date, time, end) {
    return `<dt>Palvelu</dt><dd>${esc(svc)}</dd><dt>Aika</dt><dd>${fiDateLong(date)} klo ${time}${end ? `–${end}` : ""}</dd>`;
  }

  // 3. Yhteystiedot
  function showDetails() {
    const end = (() => { const [h, m] = state.time.split(":").map(Number); const t = h * 60 + m + state.service.duration; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; })();
    $("[data-summary]").innerHTML = summaryHtml(state.service.name, state.date, state.time, end) + `<dt>Hinta</dt><dd>${esc(state.service.price)} €</dd>`;
    panels.details.hidden = false;
    $("[data-form-error]").hidden = true;
    setStep(3);
    scrollTo(panels.details);
    setTimeout(() => panels.details.querySelector('input[name="name"]').focus({ preventScroll: true }), 300);
  }

  $("[data-back]").addEventListener("click", () => { panels.details.hidden = true; setStep(2); scrollTo(panels.time); });

  panels.details.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(panels.details);
    const errBox = $("[data-form-error]");
    const fields = ["name", "phone", "email"];
    const empty = fields.find((k) => !String(f.get(k) || "").trim());
    if (empty) {
      errBox.textContent = { name: "Kirjoita nimesi.", phone: "Kirjoita puhelinnumerosi.", email: "Kirjoita sähköpostiosoitteesi." }[empty];
      errBox.hidden = false;
      panels.details.querySelector(`[name="${empty}"]`).focus();
      return;
    }
    const btn = $("[data-submit]");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Varataan…';
    errBox.hidden = true;
    try {
      const r = await api("/api/book", {
        method: "POST",
        body: { serviceId: state.service.id, date: state.date, time: state.time, name: f.get("name"), phone: f.get("phone"), email: f.get("email"), note: f.get("note"), website: f.get("website") },
      });
      showDone(r, String(f.get("email")));
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
      if (err.status === 409) { state.time = null; loadSlots(); }
    } finally {
      btn.disabled = false;
      btn.textContent = "Vahvista varaus";
    }
  });

  function showDone(r, email) {
    const b = r.booking;
    Object.values(panels).forEach((p) => (p.hidden = true));
    document.querySelector(".steps").hidden = true;
    panels.done.hidden = false;
    $("[data-done-summary]").innerHTML = summaryHtml(b.serviceName, b.date, b.time, b.end) + `<dt>Hinta</dt><dd>${esc(b.price)} €</dd>`;
    const msg = $("[data-done-email]");
    if (r.email === "sent") msg.textContent = `Vahvistus ja peruutuslinkki lähetettiin osoitteeseen ${email}.`;
    else if (r.email === "failed") msg.textContent = "Varaus on voimassa, mutta vahvistusviestin lähetys epäonnistui. Ota kuvakaappaus tästä sivusta.";
    else msg.textContent = "Demotilassa sähköpostia ei lähetetä. Alla näet täsmälleen sen viestin, jonka asiakas saisi.";
    if (r.preview) {
      const wrap = $("[data-email-preview]");
      wrap.innerHTML = `<div class="email-preview"><div class="bar">Vastaanottaja ${esc(r.preview.to)}<br><strong>${esc(r.preview.subject)}</strong></div><iframe title="Vahvistusviestin esikatselu" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe></div>
        ${r.cancelUrl ? `<p style="margin-top:12px"><a href="${esc(r.cancelUrl)}">Kokeile peruutuslinkkiä</a></p>` : ""}`;
      const frame = wrap.querySelector("iframe");
      frame.addEventListener("load", () => { try { frame.style.height = frame.contentDocument.documentElement.scrollHeight + 4 + "px"; } catch {} });
      frame.srcdoc = r.preview.html.replace("<head>", '<head><base target="_blank">').replace("<html>", "<html><head><base target=\"_blank\"></head>");
    }
    panels.done.focus();
    scrollTo(panels.done);
  }

  // Esivalinnat etusivun linkistä: /varaa?palvelu=...&paiva=...&aika=...
  const q = new URLSearchParams(location.search);
  const pre = s.services.find((x) => x.id === q.get("palvelu"));
  if (pre) {
    const radio = document.querySelector(`input[name="service"][value="${CSS.escape(pre.id)}"]`);
    radio.checked = true;
    state.service = pre;
    if (q.get("paiva") && isOpen(q.get("paiva"))) state.date = q.get("paiva");
    panels.time.hidden = false;
    setStep(2);
    const t = q.get("aika");
    renderDays().then(() => {
      const b = t && /^\d{2}:\d{2}$/.test(t) && document.querySelector(`[data-time="${t}"]`);
      if (b) b.click();
    });
  }
})();
