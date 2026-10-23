// Etusivu, palvelut ja yhteystiedot: hinnasto, aukioloajat ja seuraavat vapaat ajat palvelimelta.
(async () => {
  const { esc, settings, api, today, addDays, weekday, hourLabel, fiDateLong } = window.K;
  let s;
  try {
    s = await settings();
  } catch {
    document.querySelectorAll("[data-price-list]").forEach((el) => (el.innerHTML = '<li class="muted">Hinnaston lataus epäonnistui. Päivitä sivu.</li>'));
    const label = document.querySelector("[data-next-label]");
    if (label) label.textContent = "Vapaita aikoja ei saatu haettua. Katso kaikki ajat varaussivulta.";
    return;
  }

  // Hinnasto
  document.querySelectorAll("[data-price-list]").forEach((el) => {
    const limit = Number(el.dataset.limit) || s.services.length;
    el.innerHTML = s.services.slice(0, limit).map((sv) => `
      <li><span class="name">${esc(sv.name)} <span class="dur">${sv.duration} min</span></span>
      <span class="price">${esc(sv.price)} €</span>
      ${sv.desc ? `<span class="desc">${esc(sv.desc)}</span>` : ""}</li>`).join("");
  });

  // Aukioloajat (ma–su)
  const order = [1, 2, 3, 4, 5, 6, 0];
  const todayWd = weekday(today());
  document.querySelectorAll("[data-hours] tbody").forEach((tb) => {
    tb.innerHTML = order.map((d) => `<tr${d === todayWd ? ' class="today"' : ""}><td>${window.K.WD_LONG[d]}${d === todayWd ? " (tänään)" : ""}</td><td>${hourLabel(s.hours[d])}</td></tr>`).join("");
  });

  // Seuraavat vapaat ajat (hiustenleikkaus), etsitään enintään 10 päivää eteenpäin
  const box = document.querySelector("[data-next-slots]");
  if (!box) return;
  const label = document.querySelector("[data-next-label]");
  const service = s.services[0];
  let day = today();
  for (let i = 0; i < 10; i++, day = addDays(day, 1)) {
    if (!s.hours[weekday(day)] || s.closedDates.includes(day)) continue;
    try {
      const r = await api(`/api/slots?date=${day}&service=${encodeURIComponent(service.id)}`);
      if (r.slots.length) {
        const when = i === 0 ? "Tänään" : i === 1 ? "Huomenna" : fiDateLong(day);
        label.textContent = `${when}, ${service.name.toLowerCase()} (${service.duration} min)`;
        box.innerHTML = r.slots.slice(0, 8).map((t) =>
          `<a href="/varaa?palvelu=${encodeURIComponent(service.id)}&paiva=${day}&aika=${t}">${t}</a>`).join("");
        return;
      }
    } catch {
      break;
    }
  }
  label.textContent = "Lähipäivät ovat täynnä. Katso myöhemmät ajat varaussivulta.";
})();
