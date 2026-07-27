// Delad scenariotabell för nudge-livscykeln.
//
// NudgeMe har TVÅ motorer med samma regler: klientens (src/lib/nudge/service.ts,
// lokalt läge) och serverns (server/src/engine.ts, serverläge). De är medvetet
// separata implementationer — men de måste bete sig likadant. Buggen där en orörd
// nudge låg kvar i dagar krävde två separata kodändringar, och ingenting hindrade
// att bara den ena blev gjord.
//
// Därför bor reglerna här, som data, och körs mot BÅDA motorerna:
//   klient → src/lib/nudge/service.test.ts
//   server → server/src/engine.test.ts
//
// Lägger du till en livscykelregel: lägg fallet här FÖRST, se båda testerna bli
// röda, fixa sedan båda motorerna.
//
// Filen får medvetet inte ha några imports — den läses av två skilda tsconfigs.

/** Livscykelstatus (spegling av NudgeStatus / nudges.status i SQLite). */
export type CaseStatus =
  | "sent"
  | "acked"
  | "committed"
  | "done"
  | "ignored"
  | "snoozed";

export interface CaseNudge {
  /** Aktivitet ur den fasta poolen: "a1" | "a2" | "a3". */
  activityId: string;
  /** Hur långt före "nu" nudgen skickades. */
  hoursAgo: number;
  status: CaseStatus;
}

export interface LifecycleCase {
  name: string;
  /** Nudges som redan finns när motorn kör. */
  history: CaseNudge[];
  /** Har användaren pausat appen? */
  paused?: boolean;
  /** Har tidpunkten för nästa nudge passerat? */
  due: boolean;
  /** Ska motorn skapa en NY nudge i det här läget? */
  createsNew: boolean;
  /** Status på de befintliga nudgarna efteråt (samma ordning som `history`). */
  after: CaseStatus[];
}

/**
 * Aktiviteterna alla fall kör mot: tre st i klass A (inget frekvenstak), så att
 * taklogiken aldrig grumlar det livscykeln testar. Frekvenstaket har egna tester.
 */
export const CASE_ACTIVITIES = ["a1", "a2", "a3"] as const;

export const LIFECYCLE_CASES: LifecycleCase[] = [
  // --- Kärnregeln: vad blockerar en ny nudge? ---
  {
    // Regressionstest för den rapporterade buggen: samma aktivitet låg kvar i
    // dagar eftersom en orörd `sent` räknades som aktiv och blockerade nytt.
    name: "orörd sent ersätts när nästa är due",
    history: [{ activityId: "a1", hoursAgo: 24, status: "sent" }],
    due: true,
    createsNew: true,
    after: ["ignored"],
  },
  {
    name: "acked behålls – användaren har engagerat sig",
    history: [{ activityId: "a1", hoursAgo: 24, status: "acked" }],
    due: true,
    createsNew: false,
    after: ["acked"],
  },
  {
    name: "committed behålls – användaren har lovat att göra den",
    history: [{ activityId: "a1", hoursAgo: 24, status: "committed" }],
    due: true,
    createsNew: false,
    after: ["committed"],
  },
  {
    // AVSIKTLIGT och beslutat av Adam: har användaren tryckt "Ja, jag gör det"
    // kommer ingen ny nudge förrän hon tryckt "Klart!" eller "Inte just nu" —
    // hur lång tid som helst. Appen ska inte tjata över ett löfte hon gett.
    // Det HÄR fallet finns för att fånga en välmenande "fix" som lägger in en
    // timeout/auto-förfallodatum. Blir det här testet rött: fixa inte testet.
    name: "åtagande blockerar även långt senare (en månad) – ingen timeout",
    history: [{ activityId: "a1", hoursAgo: 24 * 30, status: "committed" }],
    due: true,
    createsNew: false,
    after: ["committed"],
  },
  {
    name: "snoozad ersätts och auto-ignoreras",
    history: [{ activityId: "a1", hoursAgo: 24, status: "snoozed" }],
    due: true,
    createsNew: true,
    after: ["ignored"],
  },
  {
    name: "done blockerar aldrig",
    history: [{ activityId: "a1", hoursAgo: 24, status: "done" }],
    due: true,
    createsNew: true,
    after: ["done"],
  },
  {
    name: "ignored blockerar aldrig",
    history: [{ activityId: "a1", hoursAgo: 24, status: "ignored" }],
    due: true,
    createsNew: true,
    after: ["ignored"],
  },
  {
    name: "tom historik – första nudgen skapas",
    history: [],
    due: true,
    createsNew: true,
    after: [],
  },

  // --- Kombinationer: engagemang vinner över orörd ---
  {
    name: "engagerad acked blockerar även när en orörd sent är nyare",
    history: [
      { activityId: "a1", hoursAgo: 48, status: "acked" },
      { activityId: "a2", hoursAgo: 24, status: "sent" },
    ],
    due: true,
    createsNew: false,
    after: ["acked", "sent"],
  },
  {
    name: "flera orörda ersätts allihop",
    history: [
      { activityId: "a1", hoursAgo: 48, status: "sent" },
      { activityId: "a2", hoursAgo: 24, status: "snoozed" },
    ],
    due: true,
    createsNew: true,
    after: ["ignored", "ignored"],
  },

  // --- Tid och paus ---
  {
    name: "inte due – ingenting händer",
    history: [{ activityId: "a1", hoursAgo: 24, status: "sent" }],
    due: false,
    createsNew: false,
    after: ["sent"],
  },
  {
    name: "pausad – ingen ny nudge även när det är due",
    history: [{ activityId: "a1", hoursAgo: 24, status: "sent" }],
    paused: true,
    due: true,
    createsNew: false,
    after: ["sent"],
  },
  {
    name: "pausad med tom historik – fortfarande tyst",
    history: [],
    paused: true,
    due: true,
    createsNew: false,
    after: [],
  },
];
