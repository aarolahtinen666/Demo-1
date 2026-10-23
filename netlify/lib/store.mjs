import { getStore } from "@netlify/blobs";

// Yksi sivustonlaajuinen varasto, vahva johdonmukaisuus, jotta juuri tehty
// varaus näkyy heti kaikille.
//
// Avainrakenne:
//   settings                    -> yrittäjän asetukset
//   slots/<pvm>/<HH:MM>         -> varattu tai suljettu 30 min jakso (luodaan onlyIfNew => ei tuplavarauksia)
//   bookings/<pvm>/<id>         -> varauksen tiedot
//   tokens/<peruutustunniste>   -> { date, id } asiakkaan peruutuslinkkiä varten
//   blocks/<pvm>/<id>           -> yrittäjän sulkema aikaväli

let store;
export function db() {
  if (!store) store = getStore({ name: "varaukset", consistency: "strong" });
  return store;
}
