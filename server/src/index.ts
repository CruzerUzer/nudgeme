import "dotenv/config";
import express from "express";
import cors from "cors";
import "./db.js";
import {
  register,
  login,
  requireAuth,
  requireAdmin,
  me,
  changePassword,
  adminCreateUser,
  adminResetPassword,
  listUsers,
  setRole,
  renameUser,
  deleteUser,
  isRegistrationOpen,
  setRegistrationOpen,
  HttpError,
  type AuthedRequest,
} from "./auth.js";
import { repo } from "./repo.js";
import { initUserEngine, startEngine, triggerNudge } from "./engine.js";
import * as bg from "./backgrounds.js";
import { readFileSync } from "node:fs";
import {
  DEFAULT_FREQUENCY,
  DEFAULT_NOTIFICATION_PREFS,
  defaultWeekSchedule,
  nextTimestamp,
  isValidTz,
} from "./nudge.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "6mb" })); // rymmer nedskalade bild-data-URL:er

const PORT = Number(process.env.PORT ?? 4303);

// --- Auth ---
app.post("/api/auth/register", (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    const user = register(String(username ?? ""), String(password ?? ""));
    initUserEngine(user.id); // välkomstnudge direkt
    res.json(user);
  } catch (e) {
    sendError(res, e);
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    res.json(login(String(username ?? ""), String(password ?? "")));
  } catch (e) {
    sendError(res, e);
  }
});

// Publikt: får nya registrera sig? (för att dölja "skapa konto" på login)
app.get("/api/registration-status", (_req, res) =>
  res.json({ open: isRegistrationOpen() }),
);

// --- Allt nedan kräver inloggning ---
const api = express.Router();
api.use(requireAuth);

api.get("/me", (req: AuthedRequest, res) => {
  try {
    res.json(me(req.userId!));
  } catch (e) {
    sendError(res, e);
  }
});

api.post("/auth/change-password", (req: AuthedRequest, res) => {
  try {
    const { oldPassword, newPassword } = req.body ?? {};
    changePassword(req.userId!, String(oldPassword ?? ""), String(newPassword ?? ""));
    res.json({ ok: true });
  } catch (e) {
    sendError(res, e);
  }
});

// --- Admin ---
api.get("/admin/users", requireAdmin, (_req, res) => res.json(listUsers()));
api.post("/admin/users", requireAdmin, (req, res) => {
  try {
    res.json(adminCreateUser(String(req.body?.username ?? "")));
  } catch (e) {
    sendError(res, e);
  }
});
api.post("/admin/users/:id/reset-password", requireAdmin, (req, res) => {
  try {
    res.json(adminResetPassword(req.params.id));
  } catch (e) {
    sendError(res, e);
  }
});
api.post("/admin/users/:id/role", requireAdmin, (req, res) => {
  try {
    setRole(req.params.id, req.body?.role === "admin" ? "admin" : "user");
    res.json({ ok: true });
  } catch (e) {
    sendError(res, e);
  }
});
api.post("/admin/users/:id/rename", requireAdmin, (req, res) => {
  try {
    res.json(renameUser(req.params.id, String(req.body?.username ?? "")));
  } catch (e) {
    sendError(res, e);
  }
});
api.delete("/admin/users/:id", requireAdmin, (req: AuthedRequest, res) => {
  try {
    deleteUser(req.userId!, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    sendError(res, e);
  }
});
api.put("/admin/registration", requireAdmin, (req, res) => {
  setRegistrationOpen(req.body?.open === true);
  res.json({ ok: true, open: isRegistrationOpen() });
});
// Admin-test: tvinga fram en ny aktivitet + pushnotis nu (till admins eget konto).
api.post("/admin/test-nudge", requireAdmin, (req: AuthedRequest, res) => {
  res.json(triggerNudge(req.userId!));
});

api.get("/activities", (req: AuthedRequest, res) =>
  res.json(repo.listActivities(req.userId!)),
);
api.post("/activities", (req: AuthedRequest, res) => {
  repo.upsertActivity(req.userId!, { ...req.body, userId: req.userId });
  res.json({ ok: true });
});
api.delete("/activities/:id", (req: AuthedRequest, res) => {
  repo.deleteActivity(req.userId!, req.params.id);
  res.json({ ok: true });
});

// Enkla nyckel/värde-inställningar
for (const [path, key] of [
  ["frequency", "frequency"],
  ["schedule", "schedule"],
  ["notification-prefs", "notifPrefs"],
  ["engine", "engine"],
  ["background-pack", "backgroundPack"],
] as const) {
  api.get(`/${path}`, (req: AuthedRequest, res) =>
    res.json(repo.getKv(req.userId!, key, defaultFor(key))),
  );
  api.put(`/${path}`, (req: AuthedRequest, res) => {
    let body = req.body;
    // Sanera schemat: heltal, rimliga gränser (skyddar mot t.ex. 100000/dag).
    if (key === "schedule" && Array.isArray(body)) {
      body = body.map((d: any) => ({
        ...d,
        nudgesPerDay: Math.min(24, Math.max(0, Math.floor(Number(d?.nudgesPerDay) || 0))),
        startMinutes: Math.min(1439, Math.max(0, Math.floor(Number(d?.startMinutes) || 0))),
        endMinutes: Math.min(1439, Math.max(0, Math.floor(Number(d?.endMinutes) || 0))),
      }));
    }
    repo.setKv(req.userId!, key, body);
    // När schemat ändras: räkna om nästa aktivitets-tidpunkt direkt, annars
    // sitter den kvar på den gamla (t.ex. ett dygn bort) och nya inställningar
    // (som fler per dag) får ingen effekt förrän den gamla tiden passerat.
    if (key === "schedule") {
      const next = nextTimestamp(new Date(), body ?? [], repo.getTimeZone(req.userId!));
      repo.setKv(req.userId!, "engine", {
        nextNudgeAt: next ? next.toISOString() : null,
      });
    }
    res.json({ ok: true });
  });
}

// Klienten skickar enhetens tidszon (IANA) så schema/notiser räknas i
// användarens lokala tid, inte serverns. Räknar om nästa tidpunkt om den ändras.
api.put("/timezone", (req: AuthedRequest, res) => {
  const tz = String(req.body?.tz ?? "");
  if (!isValidTz(tz)) return res.status(400).json({ error: "Ogiltig tidszon." });
  const prev = repo.getTimeZone(req.userId!);
  repo.setTimeZone(req.userId!, tz);
  if (tz !== prev) {
    const days = repo.getSchedule(req.userId!) as any[];
    const next = nextTimestamp(new Date(), days, tz);
    repo.setKv(req.userId!, "engine", { nextNudgeAt: next ? next.toISOString() : null });
  }
  res.json({ ok: true, tz });
});

api.get("/nudges", (req: AuthedRequest, res) => res.json(repo.listNudges(req.userId!)));
api.post("/nudges", (req: AuthedRequest, res) => {
  repo.upsertNudge(req.userId!, { ...req.body, userId: req.userId });
  res.json({ ok: true });
});

api.post("/push-subscriptions", (req: AuthedRequest, res) => {
  repo.upsertPushSub(req.userId!, req.body);
  res.json({ ok: true });
});
api.delete("/push-subscriptions", (req: AuthedRequest, res) => {
  // Tas bort vid utloggning så den förra användaren slutar få notiser.
  if (req.body?.endpoint) repo.deletePushSub(req.userId!, String(req.body.endpoint));
  res.json({ ok: true });
});

// Rå bildhämtning är PUBLIK (utan token) – CSS/<img> kan inte skicka Bearer.
// Måste registreras FÖRE api-routern (som annars kräver auth). Bilderna är
// delad biblioteks-konst, inte känslig data.
app.get("/api/backgrounds/image/:id", (req, res) => {
  const file = bg.getImageFile(req.params.id);
  if (!file) return res.status(404).end();
  res.setHeader("Content-Type", file.mime);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(readFileSync(file.path));
});

// Inloggningsbakgrunden är app-övergripande och hämtas PUBLIKT (pre-auth).
app.get("/api/backgrounds/login-background", (_req, res) => {
  res.json({ url: bg.loginBackgroundUrl() });
});

app.use("/api", api);

app.get("/health", (_req, res) => res.json({ ok: true }));

// Inloggade: lista paket. Admin: skapa/ladda upp/ta bort.
api.get("/backgrounds/packs", (_req, res) => res.json(bg.listPacks()));
api.post("/admin/backgrounds/packs", requireAdmin, (req, res) => {
  try {
    res.json(bg.createPack(String(req.body?.name ?? "")));
  } catch (e) {
    sendError(res, e);
  }
});
api.post(
  "/admin/backgrounds/packs/:id/image",
  requireAdmin,
  bg.upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) throw new HttpError(400, "Ingen bild.");
      res.json(await bg.addImage(req.params.id, String(req.body?.screen ?? ""), req.file.buffer));
    } catch (e) {
      sendError(res, e);
    }
  },
);
api.delete("/admin/backgrounds/packs/:id", requireAdmin, (req, res) => {
  bg.deletePack(req.params.id);
  res.json({ ok: true });
});

function defaultFor(key: string) {
  switch (key) {
    case "frequency":
      return DEFAULT_FREQUENCY;
    case "schedule":
      return defaultWeekSchedule();
    case "notifPrefs":
      return DEFAULT_NOTIFICATION_PREFS;
    case "engine":
      return { nextNudgeAt: null };
    case "backgroundPack":
      return { packId: null };
    default:
      return null;
  }
}

function sendError(res: express.Response, e: unknown) {
  if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
  console.error(e);
  res.status(500).json({ error: "Något gick fel." });
}

app.listen(PORT, () => {
  console.log(`NudgeMe-server lyssnar på http://localhost:${PORT}`);
  bg.seedBuiltinPacks();
  startEngine();
});
