import { useApp } from "@/app/AppProvider";
import { EMPTY_HISTORY, pick } from "@/copy/voice";
import type { NudgeStatus } from "@/lib/types";

const STATUS_META: Record<NudgeStatus, { label: string; className: string }> = {
  sent: { label: "Väntar", className: "bg-mist-300 text-mist-700" },
  acked: { label: "Sedd", className: "bg-mist-300 text-mist-700" },
  committed: { label: "Ska göra", className: "bg-gold-300 text-gold-700" },
  done: { label: "Genomförd", className: "bg-moss-100 text-moss-700" },
  ignored: { label: "Passerade", className: "bg-parchment-200 text-moss-400" },
  snoozed: { label: "Snoozad", className: "bg-parchment-200 text-moss-400" },
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
  const { history, activities } = useApp();
  const titleOf = (id: string) =>
    activities.find((a) => a.id === id)?.title ?? "En bortglömd aktivitet";

  const doneCount = history.filter((h) => h.status === "done").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl text-moss-700">Historik</h1>
        {history.length > 0 && (
          <p className="text-sm text-moss-500">
            {doneCount} genomförda äventyr hittills. Fint jobbat. ✨
          </p>
        )}
      </div>

      {history.length === 0 ? (
        <p className="card p-6 text-center text-moss-600">{pick(EMPTY_HISTORY)}</p>
      ) : (
        <ul className="space-y-3">
          {history.map((h) => {
            const meta = STATUS_META[h.status];
            return (
              <li key={h.id} className="card flex items-center gap-3 p-4">
                <div className="flex-1">
                  <p className="text-moss-900">{titleOf(h.activityId)}</p>
                  <p className="text-xs text-moss-400">{formatDate(h.sentAt)}</p>
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
    </div>
  );
}
