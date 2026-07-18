import express from "express";
import cors from "cors";
import "./db.js";
import { register, login, requireAuth, HttpError, type AuthedRequest } from "./auth.js";
import { repo } from "./repo.js";
import { initUserEngine, startEngine } from "./engine.js";
import {
  DEFAULT_FREQUENCY,
  DEFAULT_NOTIFICATION_PREFS,
  defaultWeekSchedule,
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

// --- Allt nedan kräver inloggning ---
const api = express.Router();
api.use(requireAuth);

api.get("/me", (req: AuthedRequest, res) => res.json({ id: req.userId }));

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
] as const) {
  api.get(`/${path}`, (req: AuthedRequest, res) =>
    res.json(repo.getKv(req.userId!, key, defaultFor(key))),
  );
  api.put(`/${path}`, (req: AuthedRequest, res) => {
    repo.setKv(req.userId!, key, req.body);
    res.json({ ok: true });
  });
}

api.get("/nudges", (req: AuthedRequest, res) => res.json(repo.listNudges(req.userId!)));
api.post("/nudges", (req: AuthedRequest, res) => {
  repo.upsertNudge(req.userId!, { ...req.body, userId: req.userId });
  res.json({ ok: true });
});

api.post("/push-subscriptions", (req: AuthedRequest, res) => {
  repo.upsertPushSub(req.userId!, req.body);
  res.json({ ok: true });
});

app.use("/api", api);

app.get("/health", (_req, res) => res.json({ ok: true }));

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
  startEngine();
});
