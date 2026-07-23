import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/AppProvider";
import { WEEKDAY_NAMES, WEEK_ORDER, minutesToHHMM, hhmmToMinutes } from "@/lib/time";
import type { DaySchedule } from "@/lib/types";

/** Max antal aktiviteter per dag (håller det vettigt och snabbt). */
export const MAX_PER_DAY = 24;

export default function Schedule() {
  const { schedule, saveSchedule } = useApp();
  // Lokal kopia så redigering blir smidig och inte skrivs över av poll/reload.
  const [days, setDays] = useState<DaySchedule[]>(schedule);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Initiera från servern första gången schemat laddats.
  useEffect(() => {
    if (days.length === 0 && schedule.length > 0) setDays(schedule);
  }, [schedule, days.length]);

  function update(weekday: number, patch: Partial<DaySchedule>) {
    setDays((prev) => {
      const next = prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d));
      // Debounca sparningen så vi inte gör ett tungt anrop per tangenttryck.
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void saveSchedule(next), 500);
      return next;
    });
  }

  const ordered = WEEK_ORDER.map((w) => days.find((d) => d.weekday === w)).filter(
    Boolean,
  ) as DaySchedule[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl text-moss-700">Schema</h1>
        <p className="text-sm text-moss-500">
          Välj tidsspann per dag. Dina aktiviteter kommer på slumpad tid inom spannet.
        </p>
      </div>

      <ul className="space-y-3">
        {ordered.map((day) => (
          <li key={day.weekday} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="font-display text-lg text-moss-800">
                {WEEKDAY_NAMES[day.weekday]}
              </span>
              <label className="flex items-center gap-2 text-sm text-moss-500">
                {day.enabled ? "På" : "Vilodag"}
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-moss-600"
                  checked={day.enabled}
                  onChange={(e) => update(day.weekday, { enabled: e.target.checked })}
                />
              </label>
            </div>

            {day.enabled && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <TimeField
                    label="Från"
                    value={day.startMinutes}
                    onChange={(v) => update(day.weekday, { startMinutes: v })}
                  />
                  <TimeField
                    label="Till"
                    value={day.endMinutes}
                    onChange={(v) => update(day.weekday, { endMinutes: v })}
                  />
                </div>
                <label className="block">
                  <span className="text-xs text-moss-500">Antal per dag</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_PER_DAY}
                    className="mt-1 w-full rounded-xl border border-parchment-200 bg-parchment-50 px-3 py-2 outline-none focus:ring-2 focus:ring-gold-500"
                    value={day.nudgesPerDay}
                    onChange={(e) => {
                      const raw = e.target.value === "" ? 0 : Number(e.target.value);
                      update(day.weekday, {
                        nudgesPerDay: Math.min(MAX_PER_DAY, Math.max(0, raw || 0)),
                      });
                    }}
                  />
                </label>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (minutes: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-moss-500">{label}</span>
      <input
        type="time"
        className="mt-1 w-full rounded-xl border border-parchment-200 bg-parchment-50 px-3 py-2 text-center tabular-nums outline-none focus:ring-2 focus:ring-gold-500"
        value={minutesToHHMM(value)}
        onChange={(e) => onChange(hhmmToMinutes(e.target.value))}
      />
    </label>
  );
}
