# Plan: Full offline för NudgeMe

Ritning för att göra appen användbar utan nät. **Inget av detta är implementerat
ännu** – idag cachas app-skalet och bakgrundsbilderna av service workern, och
appen hänger inte längre offline, men *din data* hämtas fortfarande live.

## Mål
Appen ska öppnas och vara användbar utan nät: visa *din* data (aktiviteter,
schema, inställningar, aktuell nudge, historik) och låta dig kvittera/snooza/
ändra offline – allt synkas när nätet är tillbaka.

## Nuläge (finns redan)
- Service worker precachar app-skalet och cachar bakgrundsbilder (CacheFirst).
- `AppProvider` hänger inte längre offline – men visar bara defaults/tomt
  eftersom all data hämtas live.
- Auth-grinden är synkron (JWT i localStorage) → inloggad användare når appen
  offline.
- **Två saker som gör detta enklare än väntat:** datamodellen är redan
  *upsert-baserad* (`upsertActivity`, `upsertNudge` med id) → replay blir
  idempotent. Och klienten har redan *ren* urvals-/schemalogik
  (`src/lib/nudge/`) som `LocalStore` använder → kan återanvändas offline.

## Vad som saknas
1. **Läsa offline** – cacha senast kända serversvar lokalt.
2. **Skriva offline** – köa ändringar och spela upp dem vid återanslutning.
3. **Synk & konflikter** – slå ihop köade skrivningar med serverns tillstånd.

## Arkitektur (designbeslut)

**Seam: dekorera `LocalServerStore`.** Lägg ett lager `OfflineStore` som
implementerar samma `DataStore`-gränssnitt och wrappar `LocalServerStore`. Ingen
UI-kod behöver ändras – `getStore()` returnerar wrappern i serverläge.

**Läsning – read-through-cache (IndexedDB, nyckel per `userId`):**
- Varje lyckad GET speglas till IndexedDB.
- Vid nätfel serveras senaste cache + en flagga "stale".
- *Inte* i service workern: authed, användarspecifik JSON i SW-cachen riskerar
  läckage mellan konton på delad enhet. App-lager är rätt ställe.

**Skrivning – outbox (kö i IndexedDB):**
- Varje mutation gör en *optimistisk* uppdatering av lokal cache + UI och läggs
  i kön.
- En sync-worker tömmer kön när `navigator.onLine` blir sant, vid fokus (finns
  redan) och via Background Sync API där det finns (Android/Chrome; iOS saknar
  det → töms vid nästa öppning).
- Idempotent tack vare upsert + stabila id:n.

**Konflikter:**
- Grundregel: *last-write-wins* på enkla fält (inställningar, schema,
  aktiviteter) – rimligt för en personlig app.
- Nudge-livscykeln är det svåra: servern kan ha *auto-ignorerat*/ersatt en nudge
  medan du offline markerade den "gjord". Regel: **status får bara avancera,
  aldrig backa** (sent→acked→done) – serverguard som honorerar ett
  offline-"done" även om servern hann sätta "ignored". Kräver tidsstämplar på
  statusövergångar.

**"Överraska mig" offline:** återanvänd klientens `selection.ts`/`schedule.ts`
för att välja en aktivitet lokalt (som `LocalStore` gör), köa som en genererad
nudge.

**Auth offline:** JWT kan hinna gå ut. Offline visar vi "sparad data"-banner; om
servern svarar 401 vid synk → behåll outboxen, be om inloggning, spela sen upp.
(Policy att spika.)

**Multi-user på delad enhet:** cache + outbox nollställs vid `signOut`/
användarbyte – annars läcker en användares data till nästa.

**UI:** diskret offline-banner ("Offline – ändringar synkas när du är tillbaka");
åtgärder som kräver servern men inte kan köas markeras tydligt.

## Faser (ökande komplexitet, varje fas är i sig värdefull)
1. **Offline-läsning** *(störst nytta, lägst risk)* – read-through-cache +
   offline-banner. Appen öppnas med din riktiga data offline. Skrivningar
   avaktiveras/failar snällt.
2. **Offline-skrivning** – outbox med optimistiska uppdateringar + replay +
   status-avancerings-guard på servern.
3. **Robust synk** – konfliktregler, Background Sync, "Överraska mig" offline,
   polish.

## Risker & kantfall att bevaka
- Nudge-motorns auto-ignorering vs offline-"done" (fas 2/3, kärnkomplexiteten).
- Token-utgång offline.
- IndexedDB kan vräkas av iOS under minnestryck – ok, data är återhämtningsbar.
- Delad enhet/kontobyte (cache-isolering).
- Tidszon/schema räknas redan serverside; offline visar vi bara senast kända
  nästa-tidpunkt.

## Verifiering
- Enhetstester för outbox-replay (idempotens) och cache-lagret.
- Manuell flygplansläge-E2E: öppna, ändra, återanslut, kontrollera synk.
- Multi-tab och kontobyte-isolering.

## Rekommendation
Gör **fas 1** som eget litet steg först – den ger "öppna med din data offline"
till nästan ingen risk, utan att röra skriv-vägen. Fas 2–3 tas som separat
beslut när fas 1 sitter.
