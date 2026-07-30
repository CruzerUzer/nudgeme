# CLAUDE.md

Arbetsregler och projektkontext för Claude Code i det här repot.

## Arbetsregler (viktigast)

- **Utveckla alltid på en NY branch** — starta varje ny uppgift/feature med en
  egen färsk branch (t.ex. `feature/inloggning`, `fix/snooze-status`). Aldrig
  commits direkt på `main`, och återanvänd inte en tidigare features branch för
  nytt orelaterat arbete. Öppna PR mot `main`.
- **Commita fritt — men fråga Adam innan merge.** Du får alltid commita på din
  branch utan att fråga. Merge till `main` (och push av `main`) kräver däremot
  Adams uttryckliga ja varje gång.
- **Fråga bara Adam innan deploy till PRODUKTION.** Den här dev-servern
  (hemmalinux) har SSH-behörighet att deploya till produktionsservern, men
  ingenting driftsätts/ändras i prod utan uttryckligt ja från Adam varje gång.
  Produktion = Oracle-VM `ubuntu@potterytracker.faris.se`; NudgeMe ska nås på
  **nudgeme.faris.se**. Se `DEPLOY.md` för planen.
- **Testinstansen får du uppdatera fritt — fråga inte.** När arbetet är verifierat
  (typecheck + test) kör `npm run build:test` för att bygga in ändringen i test-PWA:n;
  `vite preview` (:4305, exponerad via tailscale :8443) servar `dist/` live från disk
  så den uppdateras direkt. Bygge och lokala tester får alltid köras fritt.
- **Aldrig namn på användare i repot.** Buggrapporter kommer från riktiga
  personer, men varken namn eller deras egna aktivitetstitlar får hamna i
  commit-meddelanden, kodkommentarer, branchnamn, testdata eller dokumentation.
  Skriv "en användare rapporterade" och en avidentifierad aktivitet (`a1`, "samma
  aktivitet"). **Varför det är extra viktigt just i commits:** ett namn i en
  pushad commit går inte att städa bort utan att skriva om publicerad historik
  och `push --force`, vilket dessutom spårar ur prod-VM:ens `git pull`. I filer
  räcker en vanlig ändring — i historik gör det inte det.
- **Håll dokumentationen levande.** När du lär dig något icke-uppenbart —
  en fälla, ett arbetsflöde, en gotcha — skriv in det direkt i rätt dokument
  (CLAUDE.md för arbetsregler/konventioner, `DEPLOY.md` för drift/test/deploy,
  `TODO.md` för uppskjutet arbete) i samma veva, utan att vänta på att bli ombedd.
  Bättre en rad för mycket än att samma misstag upprepas.
- Svara på svenska. Förklara tekniska begrepp kort i förbifarten.

## Vad NudgeMe är

Mobil-först PWA som snällt (aldrig tvingande) påminner om roliga/utvecklande
aktiviteter. Slumpade nudges inom valbara tidsspann per veckodag,
frekvensklasser A–D med justerbara tak per aktivitet, kvittering + livscykel,
"Överraska mig" på begäran, fyra notisnivåer, historik och viloläge. Tema:
alviskt/natur/romantasy med humoristisk copy.

## Kommandon

```bash
npm run dev        # dev-server (porten allokeras via Helm: helmctl port claim nudgeme)
npm run typecheck  # tsc -b --noEmit — verifiera typerna UTAN att skriva dist/
npm run build      # typecheck + produktionsbygge → dist/  (⚠️ se nedan)
npm run test       # enhetstester (Vitest) — kör BÅDE src/ och server/
cd server && npm run typecheck   # ⚠️ serverns typer — täcks INTE av roten
node scripts/gen-icons.mjs   # regenerera PWA-ikoner
```

Verifiera alltid med `npm run typecheck` + `npm run test` innan en PR. Vid
UI-ändringar: kör dev-servern och ta gärna en skärmbild (mobilvy 390px).

> ⚠️ **`npm run typecheck` i roten typkollar inte `server/`.** Rot-tsconfigen har
> `include: ["src"]`, så serverkoden är osynlig för den — medan `npm run test`
> *kör* serverns tester. Rör ändringen `server/`: kör `cd server && npm run
> typecheck` också, annars kan ett typfel gå hela vägen till test/prod.

> ⚠️ **Kör INTE `npm run build` (lokalt läge) bara för att verifiera.** `dist/` är
> delad med testinstansen: `vite preview` (:4305, se `DEPLOY.md`) servar `dist/`
> live från disk, så ett vanligt `npm run build` skriver tyst över test-PWA:n med
> fel bygge tills nästa `build:test`. Använd `npm run typecheck` för att verifiera
> typerna. **För att uppdatera testinstansen (tillåtet fritt, ingen fråga behövs):**
> kör `npm run build:test` (server-läge + test-branding) så testinstansen förblir
> korrekt och får den nya ändringen direkt.
>
> ⚠️ **Rör ändringen `server/`? Då räcker INTE `build:test`.** Test-backenden
> (:4303) körs med `tsx` **utan watch**, så nya routes/serverlogik slår inte
> igenom förrän backenden startas om manuellt. `build:test` bygger bara om
> *frontend* — glömmer du backend-omstarten anropar den nya frontend-koden routes
> som inte finns i den körande processen, och det ser ut som att "inget händer"
> (t.ex. en knapp som inte gör något). Omstart står i `DEPLOY.md` (döda ALDRIG
> med `pkill -f "tsx src/index.ts"` — mönstret matchar ditt eget skalkommando;
> rikta mot PID:t som lyssnar på `:4303`).

## Arkitektur

- **Frontend:** React + Vite + TypeScript, PWA. Tailwind med design tokens i
  `tailwind.config.js`; global stil i `src/index.css`.
- **Datakälla-abstraktion:** `src/lib/db/store.ts` (`DataStore`) med två
  implementationer — `LocalStore` (localStorage + IndexedDB för bilder, körs
  utan backend) och `LocalServerStore` (multi-user mot den lokala servern).
  `getStore()` i `src/lib/db/index.ts` väljer källa: `VITE_API_URL` satt → server.
- **Kärnlogik (ren + testad):** `src/lib/nudge/` — `selection.ts` (frekvenstak,
  urval), `schedule.ts` (tidsspann, nästa nudge), `service.ts` (`NudgeService`:
  livscykel, auto-ignorering, "Överraska mig"), `lifecycle.cases.ts` (delade
  livscykelregler som körs mot båda motorerna — se avsnittet nedan).
- **Copy/röst:** all humoristisk text i `src/copy/voice.ts`.
- **Backend (lokal server):** `server/` — Node + Express + SQLite +
  användarnamn/lösenord (bcrypt + JWT). Nudge-motorn som worker (`engine.ts`).
  Klienten pratar med den via `LocalServerStore` när `VITE_API_URL` är satt.
  (Supabase har tagits bort – appen är helt självdriven.)
- **Push:** Web Push (VAPID) + service worker-hanterare i
  `public/push-handler.js`.

## Nudge-livscykeln — TVÅ motorer som måste ändras i par

Samma regler finns implementerade två gånger: `src/lib/nudge/service.ts`
(klienten, lokalt läge) och `server/src/engine.ts` (servern, serverläge). De är
medvetet skilda implementationer, men **beteendet måste vara identiskt**.

- Reglerna bor som data i **`src/lib/nudge/lifecycle.cases.ts`** och körs mot båda
  motorerna från `src/lib/nudge/service.test.ts` och `server/src/engine.test.ts`.
- **Ändrar du en livscykelregel: lägg fallet i tabellen FÖRST**, se båda testerna
  bli röda, fixa sedan båda motorerna. Buggen där en orörd nudge låg kvar i dagar
  krävde två separata kodändringar och ingenting kopplade ihop dem.
- `lifecycle.cases.ts` får inte ha några imports — den läses av två tsconfigs.

Håll de tre statusmängderna isär (de finns i båda motorerna). Att `VISIBLE` och
`ENGAGED` en gång var *ett* begrepp var precis det som bjöd in buggen:

| Mängd | Betyder | Statusar |
|---|---|---|
| `VISIBLE` | visas som aktuellt kort i appen | `sent`, `acked`, `committed` |
| `ENGAGED` | **blockerar** en ny nudge | `acked`, `committed` |
| `AUTO_IGNORED` | ignoreras tyst när en ny föreslås | `sent`, `snoozed` |

En orörd `sent` är alltså synlig men blockerar inte — den *ersätts* när nästa är due.

✅ **Ett åtagande blockerar utan tidsgräns — det är RÄTT beteende (Adams beslut).**
Har användaren tryckt "Ja, jag gör det" ska ingen ny nudge komma förrän hon
tryckt **"Klart!"** eller **"Inte just nu"**. Det gäller hur länge som helst: en
`committed` från förra månaden blockerar fortfarande. Appen ska inte tjata över
ett löfte hon redan gett.

> Kommer någon och rapporterar "appen har slutat nudga" — kontrollera först om det
> finns en obesvarad `acked`/`committed`. Är det så: **lägg inte in någon timeout
> eller auto-förfallodatum.** Det ser ut som samma bugg som en orörd `sent` som
> fastnade, men är det inte. Fallet *"åtagande blockerar även långt senare"* i
> `lifecycle.cases.ts` finns just för att fånga den "fixen".

⚠️ **Dagens tidpunkter måste vara STABILA — motorn är tillståndslös.** Efter varje
skickad nudge räknas nästa tidpunkt om från "nu" (`nextNudgeTimestamp` respektive
`nextTimestamp`). Slumpas dagens tider om vid varje omräkning landar den nya
tidpunkten senare samma dag i ungefär hälften av fallen → 2–3 nudges på ett dygn
trots "1 per dag" (en användare rapporterade exakt det). Tiderna fröas därför på
`(userId, datum, slot-index)`: samma dygn ger alltid samma plan, och en passerad
tidpunkt kan aldrig dyka upp igen. Fröet **måste innehålla slot-indexet** — en
löpande RNG förskjuts av prestandahoppet som hoppar förbi passerade slots.
Schemareglerna är delad data på samma sätt som livscykeln:
**`src/lib/nudge/schedule.cases.ts`**, körd från `src/lib/nudge/schedule.test.ts`
(klient) och `server/src/nudge.test.ts` (server).

⚠️ **En stabil plan räcker INTE — dygnsräknaren håller taket när indata ändras.**
Fröet gör planen stabil givet *fasta* indata. Ändras indata mitt i dygnet ritas
planen om från noll, och en slot som redan gått ut kan återuppstå senare samma dag
→ två aktiviteter trots "1 per dag". Motorn bokför därför `sentDayKey` +
`sentCount` i sitt kv-tillstånd, och omräkningen hoppar över dygnets förbrukade
slots (`deliveredToday` i `nextTimestamp`/`nextNudgeTimestamp`).

- **Skriv aldrig `nextNudgeAt` på egen hand.** Gå via `reschedule()` i
  `server/src/engine.ts` respektive `scheduleNext`/`rescheduleNow` i
  `src/lib/nudge/service.ts`. Buggen bodde i att omräkningen fanns i *fem* kopior
  (motorn, `PUT /schedule`, `PUT /timezone`, `AppProvider.saveSchedule`) och
  kopian i tidszonsrouten tappade räknaren.
- **Även en DEPLOY ritar om planen.** Det var så den rapporterade dubbleringen
  uppstod: fixen som gjorde tiderna stabila ändrade själva planens grund, medan
  ett gammalt slumpat `nextNudgeAt` låg kvar i databasen. Det smällde först, och
  omräkningen landade sedan på den *nya* planens tid — som fortfarande låg framåt
  samma dag. Två nudges, en gång per användare. (Bevisat i efterhand: dygnets
  andra nudge låg exakt på den fröade tiden, den första på ingen alls.)
  **Ändrar du fröet, spannet eller tidszonshanteringen — räkna med samma
  engångseffekt och kontrollera att räknaren fångar den.**
- **Tidszonen kan också studsa.** Klienten skickar enhetens tidszon vid varje
  appstart *och* varje fokus (`AppProvider.syncTimeZone`). Öppnas kontot både på
  telefonen och i en webbläsare på en UTC-maskin studsar `timeZone` fram och
  tillbaka, och varje studs ritade om dagens plan. Räknaren gör studsen ofarlig.
- Räknaren fylls **inte** från `nudges`-tabellen: "Överraska mig"-poster ligger i
  samma tabell utan egen markering och skulle räknas som schemalagda — då tystnar
  dagens riktiga nudge i stället. Den är eget tillstånd, med allt vad det innebär.

✅ **Ett ändrat schema gäller DIREKT, men nollställer inte räknaren (Adams beslut,
reviderat).** Höjer användaren antalet per dag kommer resten av kvoten samma dag;
sänker hon det under räknarens värde blir dygnet bara tyst resten av dagen. Ett
flyttat tidsspann slår igenom direkt så länge kvoten är kvar — men återupplivar
aldrig en redan levererad nudge. (Det tidigare beslutet "ett ändrat schema får ge
en extra nudge samma dag" fanns bara för att en räknare saknades.)

> Ser du "två nudges samma dag" i en rapport — leta efter en **omplanering mitt i
> dygnet**, inte efter omslumpade tider. Och **ta inte bort dygnsräknaren** för att
> återställa det gamla schemabeteendet. Fallen i `REPLAN_CASES`
> (`schedule.cases.ts`) plus *"tidszonsbytet ger ingen extra nudge samma dag"*
> (server) och *"ett flyttat tidsspann återupplivar inte dagens levererade nudge"*
> (klient) finns just för att fånga den "fixen".

> Admin-knappen "testa notis" (`triggerNudge`) **läser av kvoten, kör testet och
> lägger tillbaka kvoten** (hela `engine`-kv:t, så även `nextNudgeAt`). Ett
> push-test får aldrig tyst äta upp dagens riktiga aktivitet — `generate` räknar
> upp kvoten inuti, så utan återställningen skulle det göra just det. Kvotläget
> returneras (`delivered`/`planned`) och visas i admin-vyn.

⚠️ **Auto-ignorering måste synas i urvalet.** `generate()` läser historiken,
skriver `ignored` och väljer sedan aktivitet. Skicka den **uppdaterade**
historiken till urvalet — annars räknas den nyss ignorerade fortfarande som
`sent`, äter frekvenstaket, och poolen kan tömmas helt (varannan nudge uteblev
för den som bara hade en valbar aktivitet). En nudge du aldrig såg ska inte
förbruka ditt tak.

## Konventioner

- Aldrig hårdkoda dev-portar — begär via Helm (`helmctl port claim <service>`).
- Håll affärslogik i `src/lib/nudge/` som rena funktioner med tester; UI:t tunt.
- **Testa orkestreringen, inte bara de rena funktionerna.** Den rapporterade
  buggen gled igenom för att `selection.ts`/`schedule.ts` var väl täckta medan
  motorerna som *använder* dem hade noll tester. Rena hjälpfunktioner räcker
  inte som skydd.
  **Lärdom från "2–3 nudges per dag":** en korrekt `nextTimestamp` skyddar inte
  om motorn *anropar* den fel — med ett frö som varierar per anrop var buggen
  helt tillbaka medan alla schematester förblev gröna. Därför finns testet
  *"1 per dag ger exakt 1 nudge per dygn"* i BÅDA motortesterna
  (`server/src/engine.test.ts`, `src/lib/nudge/service.test.ts`): det kör motorn
  minut för minut över flera dygn och räknar. Sabotera anropsstället när du rör
  schemaläggningen — blir inte de två testerna röda är skyddet borta.
- **Bevisa att ett regressionstest fallerar mot den buggiga koden.** Ett test som
  aldrig setts bli rött är ingen garanti — det kan testa fel sak och vara grönt av
  en slump. Rulla tillbaka fixen tillfälligt och kör:
  ```bash
  git checkout <commit-före-fixen>^ -- <fil>   # eller stasha fixen
  npx vitest run <testfil>                      # ska bli RÖTT
  git checkout HEAD -- <fil>                    # återställ
  ```
  Gäller dubbelt när samma regel finns i båda motorerna: kontrollera att testet
  blir rött för *var och en* av dem, annars skyddar du bara den ena.
  Ofta räcker det att **sabotera anropsstället** i stället för att rulla tillbaka
  (t.ex. skicka `0` där dygnsräknaren ska in) — snabbare och träffar just den
  koppling testet påstår sig skydda.

  **Blir testet grönt trots sabotaget är det testet som är fel, inte sabotaget.**
  Det hände i dubbelnudge-jakten: klienttestet sparade om ett *oförändrat* schema,
  och eftersom klientmotorn räknar i webbläsarens egen tid kunde den omräkningen
  aldrig flytta planen — testet kunde alltså inte bli rött ens med buggen kvar.
  Scenariot måste vara något **just den motorn faktiskt kan råka ut för**: servern
  har tidszonsbyten, klienten bara schemaändringar. Två motorer, samma regel — men
  inte alltid samma utlösare.
- En aktivitet har exakt en valfri bild (`imageUrl`). Seeda inga bilder.
- Se `TODO.md` för medvetet uppskjutet arbete.
