import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/app/AppProvider";
import { EMPTY_HISTORY, pick } from "@/copy/voice";
import type { NudgeStatus } from "@/lib/types";

const STATUS_META: Record<NudgeStatus, { label: string; className: string }> = {
  sent: { label: "Väntar", className: "bg-mist-300 text-mist-700" },
  acked: { label: "Sedd", className: "bg-mist-300 text-mist-700" },
  committed: { label: "Ska göra", className: "bg-gold-300 text-gold-700" },
  done: { label: "Genomförd", className: "bg-moss-100 text-moss-700" },
  ignored: { label: "Passerade", className: "bg-parchment-200 text-moss-400" },
  snoozed: { label: "Snoozad", className: "bg-parchment-200 text-moss-500" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("sv-SE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function History() {
  const { history, activities, service, reload } = useApp();
  const navigate = useNavigate();
  const titleOf = (id: string) =>
    activities.find((a) => a.id === id)?.title ?? "En bortglömd aktivitet";

  const doneCount = history.filter((h) => h.status === "done").length;
  // Visa 50 i taget. Nollställs till 50 varje gång vyn öppnas (komponenten
  // monteras om vid navigering), enligt önskemål.
  const PAGE = 50;
  const [limit, setLimit] = useState(PAGE);
  const shown = history.slice(0, limit);

  // Ångra en snooze: ta fram kortet på Hem (som committed), inte klarmarkera.
  async function reviveSnoozed(id: string) {
    await service.reviveSnoozed(id);
    await reload();
    navigate("/");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl text-moss-700">Historik</h1>
        {history.length > 0 && (
          <p className="text-sm text-moss-500">
            {doneCount} genomförda aktiviteter hittills. Fint jobbat. ✨
          </p>
        )}
      </div>

      {history.length === 0 ? (
        <p className="card p-6 text-center text-moss-600">{pick(EMPTY_HISTORY)}</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((h) => {
            const meta = STATUS_META[h.status];
            const revivable = h.status === "snoozed";
            return (
              <li key={h.id} className="card flex items-center gap-3 p-4">
                <div className="flex-1">
                  <p className="text-moss-900">{titleOf(h.activityId)}</p>
                  <p className="text-xs text-moss-400">{formatDate(h.sentAt)}</p>
                  {revivable && (
                    <button
                      className="mt-2 rounded-full bg-moss-700 px-3 py-1 text-xs font-semibold text-parchment-50 active:scale-[0.98]"
                      onClick={() => reviveSnoozed(h.id)}
                    >
                      Ångrade dig? Ta fram igen
                    </button>
                  )}
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}
                >
                  {meta.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {history.length > shown.length && (
        <button
          className="btn-ghost w-full"
          onClick={() => setLimit((l) => l + PAGE)}
        >
          Visa nästa {Math.min(PAGE, history.length - shown.length)}
        </button>
      )}
    </div>
  );
}
