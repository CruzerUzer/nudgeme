import { useMemo, useState } from "react";
import { useApp } from "@/app/AppProvider";
import { EMPTY_ACTIVITIES, LABELS, pick } from "@/copy/voice";
import { fileToDataUrl } from "@/lib/image";
import type { Activity, FrequencyClass } from "@/lib/types";

const CLASS_LABEL: Record<FrequencyClass, string> = {
  A: "A · ofta",
  B: "B · ~1/vecka",
  C: "C · ~1/månad",
  D: "D · sällan",
};

const CLASS_COLOR: Record<FrequencyClass, string> = {
  A: "bg-moss-100 text-moss-700",
  B: "bg-mist-300 text-mist-700",
  C: "bg-gold-300 text-gold-700",
  D: "bg-blush-400/40 text-blush-600",
};

const CLASS_ORDER: Record<FrequencyClass, number> = { A: 0, B: 1, C: 2, D: 3 };

const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)) as string;

/** Sortera: aktiva före inaktiva; inom varje grupp per kategori, sedan titel. */
function sortActivities(list: Activity[]): Activity[] {
  return [...list].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.frequency !== b.frequency)
      return CLASS_ORDER[a.frequency] - CLASS_ORDER[b.frequency];
    return a.title.localeCompare(b.title, "sv");
  });
}

export default function Activities() {
  const { activities, saveActivity, deleteActivity } = useApp();
  const [editing, setEditing] = useState<Activity | null>(null);
  const sorted = useMemo(() => sortActivities(activities), [activities]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-moss-700">Aktiviteter</h1>
        <button className="btn-primary" onClick={() => setEditing(blank())}>
          {LABELS.addActivity}
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="card p-6 text-center text-moss-600">
          {pick(EMPTY_ACTIVITIES)}
        </p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((a) => (
            <li key={a.id} className="card flex items-center gap-3 p-4">
              <span
                className={`rounded-full px-2 py-1 text-xs font-bold ${CLASS_COLOR[a.frequency]}`}
              >
                {a.frequency}
              </span>
              {a.imageUrl && (
                <img
                  src={a.imageUrl}
                  alt=""
                  className="h-11 w-11 rounded-xl object-cover"
                />
              )}
              <button className="flex-1 text-left" onClick={() => setEditing(a)}>
                <span
                  className={`text-lg ${a.active ? "text-moss-900" : "text-moss-400 line-through"}`}
                >
                  {a.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <Editor
          activity={editing}
          onCancel={() => setEditing(null)}
          onSave={async (a) => {
            await saveActivity(a);
            setEditing(null);
          }}
          onDelete={async (id) => {
            await deleteActivity(id);
            setEditing(null);
          }}
        />
      )}
    </div>
  );

  function blank(): Activity {
    return {
      id: uid(),
      userId: "",
      title: "",
      frequency: "A",
      tags: [],
      active: true,
      createdAt: new Date().toISOString(),
    };
  }
}

function Editor({
  activity,
  onSave,
  onCancel,
  onDelete,
}: {
  activity: Activity;
  onSave: (a: Activity) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Activity>(activity);
  const [imgError, setImgError] = useState<string | null>(null);
  const isNew = !activity.title;

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      // Exakt en bild per aktivitet: den nya ersätter alltid den gamla.
      setDraft((d) => ({ ...d, imageUrl: dataUrl }));
    } catch {
      setImgError("Kunde inte läsa bilden. Prova en annan.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-moss-900/40 p-0 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="card max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-b-none p-6 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl text-moss-700">
          {isNew ? "Ny aktivitet" : "Redigera aktivitet"}
        </h2>

        <label className="block">
          <span className="text-sm text-moss-500">Vad?</span>
          <input
            autoFocus
            className="mt-1 w-full rounded-2xl border border-parchment-200 bg-parchment-50 px-4 py-3 outline-none focus:ring-2 focus:ring-gold-500"
            value={draft.title}
            placeholder="T.ex. Tända ljus"
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>

        <div>
          <span className="text-sm text-moss-500">Hur ofta?</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(Object.keys(CLASS_LABEL) as FrequencyClass[]).map((c) => (
              <button
                key={c}
                onClick={() => setDraft({ ...draft, frequency: c })}
                className={`rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                  draft.frequency === c
                    ? "border-moss-600 bg-moss-50 text-moss-700"
                    : "border-parchment-200 text-moss-500"
                }`}
              >
                {CLASS_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        {/* Bild: exakt en per aktivitet */}
        <div>
          <span className="text-sm text-moss-500">Bild (valfritt, en per aktivitet)</span>
          {draft.imageUrl ? (
            <div className="mt-2">
              <img
                src={draft.imageUrl}
                alt=""
                className="max-h-48 w-full rounded-2xl object-cover"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="btn-ghost cursor-pointer text-sm">
                  Byt bild
                  <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
                </label>
                <label className="btn-ghost cursor-pointer text-sm">
                  Ta foto
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={onPickImage}
                  />
                </label>
                <button
                  className="btn text-sm text-blush-600 hover:bg-blush-400/10"
                  onClick={() => setDraft({ ...draft, imageUrl: undefined })}
                >
                  Ta bort bild
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-parchment-200 bg-parchment-50 px-4 py-6 text-center text-moss-500">
                Ladda upp bild
                <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
              </label>
              <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-parchment-200 bg-parchment-50 px-4 py-6 text-center text-moss-500">
                Ta foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={onPickImage}
                />
              </label>
            </div>
          )}
          {imgError && <p className="mt-1 text-sm text-blush-600">{imgError}</p>}
        </div>

        <label className="flex items-center justify-between rounded-2xl bg-parchment-50 px-4 py-3">
          <span className="text-moss-600">Aktiv</span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-moss-600"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          />
        </label>

        <div className="flex gap-3 pt-2">
          <button
            className="btn-primary flex-1 disabled:opacity-40"
            disabled={!draft.title.trim()}
            onClick={() => onSave(draft)}
          >
            Spara
          </button>
          <button className="btn-ghost" onClick={onCancel}>
            Avbryt
          </button>
        </div>
        {!isNew && (
          <button
            className="btn w-full text-blush-600 hover:bg-blush-400/10"
            onClick={() => onDelete(draft.id)}
          >
            Ta bort
          </button>
        )}
      </div>
    </div>
  );
}
