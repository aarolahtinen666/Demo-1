// Kokoaa sivut public/-kansioon yhteisellä ylä- ja alapalkilla.
// Muokkaa sisältöä täällä ja aja: node scripts/build-pages.mjs
import { writeFileSync } from "node:fs";

const B = { name: "Parturi Kuura", address: "Esimerkkikatu 5, 40100 Jyväskylä", phone: "040 000 0000", email: "hello@parturikuura.example" };

const logo = `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
<path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13"/><path d="M12.5 5.5 16 9l3.5-3.5M12.5 26.5 16 23l3.5 3.5M5 14l4.8-1.2L8.5 8M27 18l-4.8 1.2 1.3 4.8M5 18l4.8 1.2L8.5 24M27 14l-4.8-1.2L23.5 8"/></svg>`;

const nav = [
  ["/", "Etusivu"],
  ["/palvelut", "Palvelut ja hinnat"],
  ["/yhteystiedot", "Yhteystiedot"],
];

function page({ path, title, description, body, scripts = [], noindex = false, bare = false }) {
  const links = nav.map(([href, label]) => `<a href="${href}"${href === path ? ' aria-current="page"' : ""}>${label}</a>`).join("\n        ");
  return `<!doctype html>
<html lang="fi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  ${noindex ? '<meta name="robots" content="noindex">' : ""}
  <meta name="theme-color" content="#16302b">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <div class="demo-strip">Esittelysivu: ${B.name} on kuvitteellinen yritys. Varaukset ovat testivarauksia.</div>
  <header class="site-header">
    <div class="wrap">
      <a class="logo" href="/">${logo}${B.name}</a>
      ${bare ? "" : `<button class="menu-btn" aria-expanded="false" aria-controls="nav">Valikko</button>
      <nav class="nav" id="nav" aria-label="Päävalikko">
        ${links}
        <a class="btn btn-small" href="/varaa">Varaa aika</a>
      </nav>`}
    </div>
  </header>
  <main id="main">
${body}
  </main>
  <footer class="site-footer">
    <div class="wrap">
      <div>
        <strong>${B.name}</strong>
        <p>${B.address}</p>
        <p><a href="tel:${B.phone.replace(/\s/g, "")}">${B.phone}</a> · <a href="mailto:${B.email}">${B.email}</a></p>
      </div>
      <div>
        <strong>Asiointi</strong>
        <p><a href="/varaa">Varaa aika</a></p>
        <p><a href="/palvelut">Hinnasto</a></p>
      </div>
      <div>
        <strong>Muuta</strong>
        <p><a href="/tietosuoja">Tietosuojaseloste</a></p>
        <p><a href="/hallinta">Yrittäjälle</a></p>
      </div>
    </div>
  </footer>
  <script src="/assets/common.js" defer></script>
${scripts.map((s) => `  <script src="${s}" defer></script>`).join("\n")}
</body>
</html>
`;
}

const hoursTable = `<table class="hours" data-hours>
          <tbody>
            <tr><td>Maanantai</td><td>9–17</td></tr><tr><td>Tiistai</td><td>9–17</td></tr>
            <tr><td>Keskiviikko</td><td>9–18</td></tr><tr><td>Torstai</td><td>9–17</td></tr>
            <tr><td>Perjantai</td><td>9–16</td></tr><tr><td>Lauantai</td><td>10–14</td></tr>
            <tr><td>Sunnuntai</td><td>Suljettu</td></tr>
          </tbody>
        </table>`;

const pages = {
  "index.html": page({
    path: "/",
    title: `${B.name} – parturi Jyväskylän keskustassa`,
    description: "Parturi Jyväskylän keskustassa. Hiustenleikkaukset, parran muotoilu ja värjäykset. Varaa aika verkosta.",
    scripts: ["/assets/home.js"],
    body: `
    <section class="hero">
      <div class="wrap">
        <div>
          <h1>Hiukset kuntoon ilman jonottamista.</h1>
          <p class="hero-lead">Leikkaukset, parrat ja värit Jyväskylän keskustassa. Valitse aika verkossa, vahvistus tulee sähköpostiin heti.</p>
          <div class="hero-actions">
            <a class="btn" href="/varaa">Varaa aika</a>
            <a class="btn btn-ghost" href="/palvelut">Katso hinnasto</a>
          </div>
        </div>
        <aside class="next-slots" aria-live="polite">
          <h2>Seuraavat vapaat ajat</h2>
          <p class="day-label" data-next-label>Haetaan vapaita aikoja…</p>
          <div class="slot-chips" data-next-slots></div>
          <a class="more" href="/varaa">Kaikki ajat</a>
        </aside>
      </div>
    </section>

    <section class="section section-alt">
      <div class="wrap two-col">
        <div>
          <h2>Palvelut</h2>
          <p class="muted">Hinnat sisältävät pesun ja muotoilun. Maksu paikan päällä kortilla tai MobilePaylla.</p>
          <a class="btn btn-quiet btn-small" href="/palvelut">Koko hinnasto</a>
        </div>
        <ul class="price-list" data-price-list data-limit="4"></ul>
      </div>
    </section>

    <section class="section">
      <div class="wrap two-col">
        <div>
          <h2>Aukioloajat</h2>
          ${hoursTable}
        </div>
        <div>
          <h2>Löydät meidät</h2>
          <p>${B.address}<br>Sisäänkäynti kadun puolelta, esteetön kulku.</p>
          <p>Lähin pysäköinti kauppakeskuksen parkkihallissa, kävelymatkaa kaksi minuuttia.</p>
          <p><a href="tel:${B.phone.replace(/\s/g, "")}">${B.phone}</a></p>
        </div>
      </div>
    </section>`,
  }),

  "palvelut.html": page({
    path: "/palvelut",
    title: `Palvelut ja hinnat – ${B.name}`,
    description: "Parturi Kuuran hinnasto: hiustenleikkaus, parran muotoilu, lasten leikkaus ja värjäys Jyväskylässä.",
    scripts: ["/assets/home.js"],
    body: `
    <div class="wrap page-head">
      <h1>Palvelut ja hinnat</h1>
      <p class="muted">Kesto on arvio. Jos et tiedä, mikä sopii, varaa hiustenleikkaus ja kysy paikan päällä.</p>
    </div>
    <section class="wrap booking">
      <ul class="price-list" data-price-list></ul>
      <p style="margin-top:28px"><a class="btn" href="/varaa">Varaa aika</a></p>
    </section>`,
  }),

  "yhteystiedot.html": page({
    path: "/yhteystiedot",
    title: `Yhteystiedot – ${B.name}`,
    description: "Parturi Kuuran osoite, puhelinnumero ja aukioloajat Jyväskylässä.",
    scripts: ["/assets/home.js"],
    body: `
    <div class="wrap page-head">
      <h1>Yhteystiedot</h1>
    </div>
    <section class="wrap booking two-col">
      <div>
        <h2>Ota yhteyttä</h2>
        <p>${B.address}</p>
        <p>Puhelin <a href="tel:${B.phone.replace(/\s/g, "")}">${B.phone}</a><br>Sähköposti <a href="mailto:${B.email}">${B.email}</a></p>
        <p class="muted">Ajanvaraus onnistuu ympäri vuorokauden verkossa. Puhelimeen vastaamme aukioloaikoina.</p>
        <a class="btn" href="/varaa">Varaa aika</a>
      </div>
      <div>
        <h2>Aukioloajat</h2>
        ${hoursTable}
      </div>
    </section>`,
  }),

  "varaa.html": page({
    path: "/varaa",
    title: `Varaa aika – ${B.name}`,
    description: "Varaa aika parturiin Jyväskylässä. Näet vapaat ajat heti ja saat vahvistuksen sähköpostiin.",
    scripts: ["/assets/booking.js"],
    body: `
    <div class="wrap page-head">
      <h1>Varaa aika</h1>
    </div>
    <section class="wrap booking" id="booking">
      <ol class="steps" aria-label="Varauksen vaiheet">
        <li data-step="1" class="active">Palvelu</li>
        <li data-step="2">Aika</li>
        <li data-step="3">Yhteystiedot</li>
      </ol>

      <div class="panel" data-panel="service">
        <h2>Valitse palvelu</h2>
        <div class="service-options" data-services role="radiogroup" aria-label="Palvelu"><p class="muted"><span class="spinner"></span> Ladataan…</p></div>
      </div>

      <div class="panel" data-panel="time" hidden>
        <h2>Valitse päivä ja aika</h2>
        <div class="day-strip" data-days role="group" aria-label="Päivä"></div>
        <div data-slots aria-live="polite"></div>
      </div>

      <form class="panel" data-panel="details" hidden novalidate>
        <h2>Yhteystiedot</h2>
        <dl class="summary" data-summary></dl>
        <div class="form-grid">
          <label class="field">Nimi<input name="name" autocomplete="name" required maxlength="80"></label>
          <label class="field">Puhelin<input name="phone" type="tel" autocomplete="tel" required maxlength="20"></label>
          <label class="field full">Sähköposti <span class="hint">Vahvistus ja peruutuslinkki lähetetään tähän.</span><input name="email" type="email" autocomplete="email" required maxlength="120"></label>
          <label class="field full">Lisätietoa <span class="hint">Vapaaehtoinen, esim. toive leikkauksesta.</span><textarea name="note" rows="3" maxlength="500"></textarea></label>
          <label class="hp" aria-hidden="true">Jätä tyhjäksi<input name="website" tabindex="-1" autocomplete="off"></label>
        </div>
        <p class="muted" style="margin-top:16px;font-size:.92rem">Käsittelemme tietoja vain ajanvarausta varten. <a href="/tietosuoja">Tietosuojaseloste</a></p>
        <div class="notice error" data-form-error hidden></div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px">
          <button class="btn" type="submit" data-submit>Vahvista varaus</button>
          <button class="btn btn-quiet" type="button" data-back>Vaihda aikaa</button>
        </div>
      </form>

      <div class="panel" data-panel="done" hidden tabindex="-1">
        <div class="confirm-head"><div class="tick" aria-hidden="true">✓</div><h2>Aika on varattu</h2></div>
        <dl class="summary" data-done-summary></dl>
        <p data-done-email></p>
        <div data-email-preview></div>
        <p style="margin-top:20px"><a class="btn btn-quiet" href="/varaa">Tee uusi varaus</a></p>
      </div>
    </section>`,
  }),

  "peru.html": page({
    path: "/peru",
    title: `Varauksesi – ${B.name}`,
    description: "Tarkista tai peru varauksesi.",
    noindex: true,
    scripts: ["/assets/cancel.js"],
    body: `
    <div class="wrap page-head">
      <h1>Varauksesi</h1>
    </div>
    <section class="wrap booking">
      <div class="panel" data-cancel-root aria-live="polite"><p class="muted"><span class="spinner"></span> Haetaan varausta…</p></div>
    </section>`,
  }),

  "tietosuoja.html": page({
    path: "/tietosuoja",
    title: `Tietosuojaseloste – ${B.name}`,
    description: "Parturi Kuuran ajanvarauksen tietosuojaseloste.",
    body: `
    <div class="wrap page-head">
      <h1>Tietosuojaseloste</h1>
      <p class="muted">Ajanvarausjärjestelmän asiakasrekisteri (EU:n tietosuoja-asetus 2016/679).</p>
    </div>
    <section class="wrap booking prose">
      <h2>Rekisterinpitäjä</h2>
      <p>${B.name}, ${B.address}. Yhteyshenkilö tietosuoja-asioissa: ${B.email}, ${B.phone}.</p>
      <h2>Mitä tietoja keräämme</h2>
      <ul><li>Nimi, puhelinnumero ja sähköpostiosoite</li><li>Varatun palvelun tiedot ja ajankohta</li><li>Lisätiedot, jotka kirjoitat itse varaukseen</li></ul>
      <h2>Miksi käsittelemme tietoja</h2>
      <p>Tietoja käytetään ajanvarauksen hoitamiseen: varausvahvistuksen, muistutusten ja muutosilmoitusten lähettämiseen sekä yhteydenottoon, jos aikaa joudutaan siirtämään. Käsittelyperuste on palvelusopimus asiakkaan kanssa. Emme käytä tietoja markkinointiin emmekä luovuta niitä eteenpäin.</p>
      <h2>Säilytys</h2>
      <p>Varaustiedot poistetaan 12 kuukauden kuluessa varatusta ajasta, ellei kirjanpitolaki edellytä pidempää säilytystä.</p>
      <h2>Käsittelijät</h2>
      <p>Verkkosivu ja tietokanta toimivat Netlify-palvelussa. Sähköpostit lähetetään sähköpostipalvelun kautta. Palveluntarjoajat käsittelevät tietoja vain meidän lukuumme.</p>
      <h2>Oikeutesi</h2>
      <p>Voit pyytää nähtäväksesi, korjattavaksi tai poistettavaksi omat tietosi ottamalla yhteyttä yllä oleviin yhteystietoihin. Sinulla on myös oikeus tehdä valitus tietosuojavaltuutetun toimistolle.</p>
    </section>`,
  }),

  "hallinta.html": page({
    path: "/hallinta",
    title: `Hallinta – ${B.name}`,
    description: "Yrittäjän ajanvarauksen hallinta.",
    noindex: true,
    bare: true,
    scripts: ["/assets/admin.js"],
    body: `
    <div class="wrap page-head" style="padding-bottom:8px">
      <h1>Ajanvarauksen hallinta</h1>
    </div>
    <section class="wrap booking" id="admin-root" aria-live="polite"></section>`,
  }),
};

for (const [file, html] of Object.entries(pages)) writeFileSync(new URL(`../public/${file}`, import.meta.url), html);
writeFileSync(new URL("../public/assets/favicon.svg", import.meta.url),
  logo.replace('aria-hidden="true"', 'xmlns="http://www.w3.org/2000/svg"').replace('stroke="currentColor"', 'stroke="#16302b"'));
writeFileSync(new URL("../public/404.html", import.meta.url), page({
  path: "", title: `Sivua ei löytynyt – ${B.name}`, description: "Sivua ei löytynyt.",
  body: `<div class="wrap page-head booking"><h1>Sivua ei löytynyt</h1><p>Linkki voi olla vanhentunut.</p><p><a class="btn" href="/">Etusivulle</a></p></div>`,
}));
console.log("Sivut koottu:", Object.keys(pages).length + 1);
