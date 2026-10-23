# Parturi Kuura – monisivuinen sivu ajanvarauksella

Kuvitteellinen parturi Jyväskylään. Tätä voi käyttää myyntidemona tai pohjana oikealle asiakkaalle.

## Mitä sivulla on

| Sivu | Mitä tekee |
|---|---|
| `/` | Etusivu. Näyttää seuraavat vapaat ajat suoraan palvelimelta, ja niitä painamalla pääsee varaamaan. |
| `/palvelut` | Hinnasto (haetaan asetuksista, joten yrittäjän muutokset näkyvät heti) |
| `/varaa` | Varauskalenteri kolmessa vaiheessa: palvelu → päivä ja aika → yhteystiedot |
| `/peru?t=…` | Asiakkaan oma linkki. Sen kautta asiakas näkee varauksensa ja voi perua sen. |
| `/yhteystiedot`, `/tietosuoja` | Yhteystiedot ja GDPR-tietosuojaseloste |
| `/hallinta` | Yrittäjän hallintanäkymä (salasanalla) |

**Yrittäjä voi hallinnassa:**
- nähdä viikon varaukset puhelimella ja soittaa tai lähettää sähköpostia asiakkaalle
- perua tai siirtää varauksen, jolloin asiakas saa automaattisesti sähköpostin
- sulkea yksittäisiä aikoja (lounas, koulutus) ja avata ne uudelleen
- muuttaa aukioloajat ja lisätä suljetut päivät (lomat, pyhät)
- muuttaa varaussääntöjä: kuinka pian voi varata, kuinka pitkälle eteenpäin ja kuinka myöhään asiakas voi perua
- muokata palveluita, kestoja ja hintoja

**Automaattiset sähköpostit:** varausvahvistus peruutuslinkillä asiakkaalle, ilmoitus uudesta varauksesta yrittäjälle, peruutusilmoitus ja siirtoilmoitus.

**Tuplavaraukset on estetty:** jokainen 30 minuutin jakso lukitaan atomisesti (Netlify Blobs `onlyIfNew`). Testeissä kuusi samanaikaista varausta samaan aikaan johtaa siihen, että vain yksi menee läpi.

## Demotila vs. oikea käyttö

Ilman ympäristömuuttujia sivu toimii **demotilassa**:
- sähköposteja ei lähetetä, vaan vahvistusviesti näytetään varauksen jälkeen sivulla
- hallinnan salasana on `kuura-demo`, ja se näkyy kirjautumissivulla

Oikealle asiakkaalle asetetaan Netlifyssä (Project configuration → Environment variables, scope: Functions):

| Muuttuja | Mihin |
|---|---|
| `ADMIN_PASSWORD` | Hallinnan salasana. **Pakollinen oikealle asiakkaalle.** |
| `SESSION_SECRET` | Pitkä satunnainen merkkijono kirjautumisen allekirjoitukseen |
| `RESEND_API_KEY` | Sähköpostipalvelun avain ([resend.com](https://resend.com), ilmainen taso riittää pienyritykselle) |
| `EMAIL_FROM` | Lähettäjä, esim. `Parturi Kuura <varaukset@asiakkaandomain.fi>`. Domain pitää vahvistaa Resendissä. |
| `OWNER_EMAIL` | Mihin ilmoitukset uusista varauksista lähtevät |

Muuttujien muuttamisen jälkeen sivu pitää julkaista uudelleen.

## Uudelle asiakkaalle

1. Muuta nimi, osoite ja tekstit tiedostossa `scripts/build-pages.mjs` ja aja `node scripts/build-pages.mjs`.
2. Muuta oletuspalvelut ja -aukiolot tiedostossa `netlify/lib/settings.mjs`. Yrittäjä voi muuttaa niitä myöhemmin itse.
3. Muuta värit `public/assets/style.css`:n alussa (`:root`).
4. Poista demoilmoitus (`demo-strip`) tiedostosta `build-pages.mjs`.
5. Aseta ympäristömuuttujat ja julkaise.

## Rakenne

```
public/                 staattiset sivut, tyylit ja selainskriptit
netlify/functions/      api.mjs (julkinen), admin.mjs (hallinta), admin-login.mjs
netlify/lib/            varauslogiikka, sähköpostit, kirjautuminen, aika (Europe/Helsinki)
scripts/                sivujen kokoaja ja paikallinen kehityspalvelin
test/                   testit ja paikallinen korvike Netlify Blobsille
```

Data tallentuu Netlify Blobsiin (`varaukset`-varasto). Se on riittävä pienyrityksen varausmäärille. Jos asiakkaalla on monta työntekijää ja paljon varauksia, kannattaa siirtyä Netlify Databaseen.

## Paikallinen testaus

```bash
node scripts/link-mock.mjs     # muistissa toimiva Blobs-korvike (vain paikallisesti)
node test/run.mjs              # 16 testiä varauslogiikalle
node scripts/dev-server.mjs    # http://localhost:8888
```

Netlifyssä oikea `@netlify/blobs` asentuu buildissa package.jsonista. Älä julkaise `node_modules`-kansiota, jossa on testikorvike.
