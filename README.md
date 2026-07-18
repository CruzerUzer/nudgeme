# 🍃 NudgeMe

En snäll, mobil-först webbapp som viskar fram roliga och utvecklande
aktiviteter du annars glömmer bort. Vacker, alvisk och romantasy-doftande —
med glimten i ögat. Aldrig tvingande, aldrig tjatig.

> _"En vänlig knuff, inte en spark."_

## Vad appen gör

- **Nudges** – slumpvis vald aktivitet ur ditt bibliotek, på slumpad tid inom
  det tidsspann du valt (olika per veckodag).
- **Frekvensklasser A–D** – A kommer ofta, D är sällsynta äventyr. Taken är
  helt justerbara (utgångsläge A: ingen gräns, B: 1/vecka, C: 1/månad,
  D: 2/år). Taket gäller **per aktivitet**.
- **Kvittering & livscykel** – markera _uppfattad_ och _genomförd_. Svarar du
  inte tjatar appen aldrig; en obesvarad nudge auto-ignoreras när nästa är dags
  (max en aktiv nudge i taget). Säger du "ska göra" men inte markerar klart
  frågar appen mjukt "hur gick det?" – en enda gång.
- **Orakel (magic eight ball)** – be om ett lekfullt svar och ett slumpförslag
  på begäran.
- **Fyra synlighetsnivåer** – från _Viskning_ (ingen notis) till _Klar signal_
  (ljud + vibration). Plus tysta timmar och viloläge.
- **Aktivitetshistorik**, CRUD på aktiviteter, och **multi-user**.

## Kom igång (lokalt läge)

```bash
npm install
npm run dev
```

Utan Supabase-nycklar kör appen i **lokalt läge**: all data ligger i
webbläsarens `localStorage` och nudge-motorn simuleras i klienten. Perfekt för
att utveckla och känna på flödet. Ett välkomnande första nudge dyker upp direkt.

Andra kommandon:

```bash
npm run build      # typecheck + produktionsbygge
npm run test       # enhetstester (urvals- och schemalogik)
npm run preview    # servera byggd app
node scripts/gen-icons.mjs   # regenerera PWA-ikoner
```

## Multi-user med lokal server (utan Supabase)

Ett alternativ till Supabase: en egen liten backend i `server/` (Node + Express
+ SQLite) med **användarnamn + lösenord** (bcrypt + JWT) och nudge-motorn som
en worker. Ger äkta multi-user och synk mellan enheter utan extern BaaS.

```bash
# 1. Starta servern (port allokeras via Helm: helmctl port claim nudgeme-server)
cd server && npm install && PORT=4303 npm start

# 2. Peka appen mot servern och starta frontend
cd .. && VITE_API_URL=http://localhost:4303 npm run dev
```

Då visar appen en inloggnings-/registreringsvy. Varje konto får egna seedade
aktiviteter och en välkomstnudge direkt. Datakällan väljs i
`src/lib/db/index.ts`: `VITE_API_URL` → `LocalServerStore` (server), annars
Supabase eller `LocalStore`.

Produktionsflaggor för servern (miljövariabler): `JWT_SECRET` (sätt ett eget!),
`PORT`, `NUDGEME_DB` (sökväg till SQLite-filen), samt valfria
`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` för web push.

> Testar du från telefonen via Tailscale? Sätt `VITE_API_URL` till serverns
> Tailscale-URL (t.ex. `http://hemmalinux.taila35f69.ts.net:4303`), inte
> `localhost`.

## Multi-user + riktiga notiser (Supabase)

1. Skapa ett gratisprojekt på [supabase.com](https://supabase.com).
2. Kör migrationerna i `supabase/migrations/` (SQL Editor eller Supabase CLI).
   De skapar tabeller + Row Level Security (dataisolering per användare).
3. Aktivera tilläggen **pg_cron** och **pg_net**, fyll i `<PROJECT_REF>` och
   service-nyckeln i `0002_cron.sql` och kör den – då anropas nudge-motorn varje
   minut.
4. Generera VAPID-nycklar och deploya Edge Function:
   ```bash
   npx web-push generate-vapid-keys
   supabase functions deploy send-nudges
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:du@exempel.se
   ```
5. Kopiera `.env.example` → `.env.local` och fyll i `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` och sätt
   `VITE_DATA_SOURCE=supabase`.

### 📱 Push på iPhone

Web Push på iOS (16.4+) fungerar **bara** när appen lagts till på hemskärmen.
Onboardingen guidar användaren: Dela-ikonen → _"Lägg till på hemskärmen"_ →
öppna NudgeMe därifrån.

## Arkitektur i korthet

| Lager        | Val                                                             |
| ------------ | -------------------------------------------------------------- |
| Frontend     | React + Vite + TypeScript, PWA (installerbar)                  |
| Styling      | Tailwind CSS med alviska design tokens (`tailwind.config.js`)  |
| Datakälla    | Abstraktion (`src/lib/db`): `LocalStore` ↔ `SupabaseStore`     |
| Backend      | Supabase (Auth, Postgres + RLS, Edge Functions, pg_cron)      |
| Push         | Web Push (VAPID) + service worker (`public/push-handler.js`)   |
| Kärnlogik    | Rena, testade funktioner i `src/lib/nudge/`                    |

Den mesta affärslogiken (urval, frekvenstak, schema) är rena funktioner med
enhetstester, och delas konceptuellt mellan klienten (`NudgeService`) och
servern (`supabase/functions/send-nudges`).

## Design & ton

- **Visuellt:** mossgrönt, gammelguld, dimblått, varm pergament-vit; organisk
  serif (Cormorant Garamond) + ren sans (Nunito Sans); mjuka, rundade former.
- **Rösten:** all humor och värme bor i `src/copy/voice.ts` – byt fritt.

Konceptskärmar togs fram i Google Stitch och byggdes i Claude Code.
