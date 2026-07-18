import { useState } from "react";
import { useApp } from "@/app/AppProvider";
import { NOTIFICATION_LEVELS, type FrequencyClass, type NotificationLevel } from "@/lib/types";
import { LABELS } from "@/copy/voice";
import { minutesToHHMM, hhmmToMinutes } from "@/lib/time";
import { enablePush, pushSupported } from "@/lib/push";

const CLASS_NAME: Record<FrequencyClass, string> = {
  A: "A · ofta",
  B: "B · sällan i veckan",
  C: "C · då och då i månaden",
  D: "D · sällsynta äventyr",
};

export default function Settings() {
  const { prefs, savePrefs, frequency, saveFrequency, localMode } = useApp();
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  async function onEnablePush() {
    setPushMsg("Ber om lov…");
    const res = await enablePush();
    setPushMsg(res.message);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl text-moss-700">Inställningar</h1>

      {/* Paus */}
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg text-moss-800">Viloläge</h2>
            <p className="text-sm text-moss-500">
              Pausa alla knuffar utan att förlora något.
            </p>
          </div>
          <button
            className={prefs.paused ? "btn-gold" : "btn-ghost"}
            onClick={() => savePrefs({ ...prefs, paused: !prefs.paused })}
          >
            {prefs.paused ? LABELS.resume : LABELS.pause}
          </button>
        </div>
      </section>

      {/* Notisnivå */}
      <section className="card p-5">
        <h2 className="text-lg text-moss-800">Hur syns knuffarna?</h2>
        <p className="mb-3 text-sm text-moss-500">
          Från nästan osynligt till tydligt. Aldrig tjatigt.
        </p>
        <div className="space-y-2">
          {(Object.keys(NOTIFICATION_LEVELS) as unknown as NotificationLevel[])
            .map(Number)
            .map((lvl) => {
              const info = NOTIFICATION_LEVELS[lvl as NotificationLevel];
              const active = prefs.level === lvl;
              return (
                <button
                  key={lvl}
                  onClick={() =>
                    savePrefs({ ...prefs, level: lvl as NotificationLevel })
                  }
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? "border-moss-600 bg-moss-50"
                      : "border-parchment-200"
                  }`}
                >
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-sm font-bold ${
                      active ? "bg-moss-600 text-parchment-50" : "bg-parchment-200 text-moss-500"
                    }`}
                  >
                    {lvl}
                  </span>
                  <span>
                    <span className="block font-semibold text-moss-800">
                      {info.name}
                    </span>
                    <span className="block text-sm text-moss-500">{info.blurb}</span>
                  </span>
                </button>
              );
            })}
        </div>

        {pushSupported() && prefs.level > 1 && (
          <div className="mt-4">
            <button className="btn-primary w-full" onClick={onEnablePush}>
              Aktivera notiser på den här enheten
            </button>
            {pushMsg && <p className="mt-2 text-sm text-moss-500">{pushMsg}</p>}
          </div>
        )}
      </section>

      {/* Tysta timmar */}
      <section className="card p-5">
        <h2 className="text-lg text-moss-800">Tysta timmar</h2>
        <p className="mb-3 text-sm text-moss-500">Inga knuffar under natten.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-moss-500">Från</span>
            <input
              type="time"
              className="mt-1 w-full rounded-xl border border-parchment-200 bg-parchment-50 px-3 py-2 outline-none focus:ring-2 focus:ring-gold-500"
              value={minutesToHHMM(prefs.quietStartMinutes)}
              onChange={(e) =>
                savePrefs({ ...prefs, quietStartMinutes: hhmmToMinutes(e.target.value) })
              }
            />
          </label>
          <label className="block">
            <span className="text-xs text-moss-500">Till</span>
            <input
              type="time"
              className="mt-1 w-full rounded-xl border border-parchment-200 bg-parchment-50 px-3 py-2 outline-none focus:ring-2 focus:ring-gold-500"
              value={minutesToHHMM(prefs.quietEndMinutes)}
              onChange={(e) =>
                savePrefs({ ...prefs, quietEndMinutes: hhmmToMinutes(e.target.value) })
              }
            />
          </label>
        </div>
      </section>

      {/* Frekvenstak */}
      <section className="card p-5">
        <h2 className="text-lg text-moss-800">Frekvenstak</h2>
        <p className="mb-3 text-sm text-moss-500">
          Hur ofta får en aktivitet i varje klass komma tillbaka?
        </p>
        <div className="space-y-3">
          {(Object.keys(CLASS_NAME) as FrequencyClass[]).map((c) => {
            const cap = frequency[c];
            const unlimited = cap.count === Infinity;
            return (
              <div key={c} className="rounded-2xl bg-parchment-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-moss-700">{CLASS_NAME[c]}</span>
                  <label className="flex items-center gap-2 text-xs text-moss-500">
                    Ingen gräns
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-moss-600"
                      checked={unlimited}
                      onChange={(e) =>
                        saveFrequency({
                          ...frequency,
                          [c]: e.target.checked
                            ? { count: Infinity, windowDays: cap.windowDays }
                            : { count: 1, windowDays: cap.windowDays || 7 },
                        })
                      }
                    />
                  </label>
                </div>
                {!unlimited && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-moss-600">
                    Max
                    <input
                      type="number"
                      min={1}
                      className="w-16 rounded-lg border border-parchment-200 px-2 py-1"
                      value={cap.count}
                      onChange={(e) =>
                        saveFrequency({
                          ...frequency,
                          [c]: { ...cap, count: Math.max(1, Number(e.target.value)) },
                        })
                      }
                    />
                    ggr per
                    <input
                      type="number"
                      min={1}
                      className="w-20 rounded-lg border border-parchment-200 px-2 py-1"
                      value={cap.windowDays}
                      onChange={(e) =>
                        saveFrequency({
                          ...frequency,
                          [c]: { ...cap, windowDays: Math.max(1, Number(e.target.value)) },
                        })
                      }
                    />
                    dagar
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {localMode && (
        <p className="px-2 text-center text-xs text-moss-400">
          Lokalt läge: data sparas bara i den här webbläsaren. Koppla ett
          Supabase-projekt för konton och riktiga notiser (se README).
        </p>
      )}
    </div>
  );
}
