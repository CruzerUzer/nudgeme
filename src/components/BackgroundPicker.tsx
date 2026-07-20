import { useEffect, useState } from "react";
import { useApp } from "@/app/AppProvider";
import {
  listPacks,
  getSelectedPack,
  selectPack,
  bgUrl,
  type BgPack,
} from "@/lib/backgrounds";

// Låter användaren välja ett bakgrundspaket (delat bibliotek). Förhandsvisar
// paketets hem-bild som miniatyr.
export default function BackgroundPicker() {
  const { reload } = useApp();
  const [packs, setPacks] = useState<BgPack[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [p, s] = await Promise.all([listPacks(), getSelectedPack()]);
        setPacks(p);
        setSelected(s.packId);
      } catch {
        /* ignorera */
      }
    })();
  }, []);

  async function choose(id: string | null) {
    setSelected(id);
    await selectPack(id);
    await reload();
  }

  const thumb = (p: BgPack) => {
    const img = p.images.find((i) => i.screen === "home") ?? p.images[0];
    return img ? bgUrl(img.url) : null;
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        onClick={() => choose(null)}
        className={`flex h-24 items-center justify-center rounded-2xl border text-sm font-semibold ${
          selected === null
            ? "border-moss-600 bg-moss-50 text-moss-700"
            : "border-parchment-200 text-moss-500"
        }`}
      >
        Ingen bakgrund
      </button>
      {packs.map((p) => {
        const t = thumb(p);
        const active = selected === p.id;
        return (
          <button
            key={p.id}
            onClick={() => choose(p.id)}
            className={`relative h-24 overflow-hidden rounded-2xl border text-left ${
              active ? "border-moss-600 ring-2 ring-gold-500" : "border-parchment-200"
            }`}
            style={t ? { backgroundImage: `url("${t}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          >
            <span className="absolute inset-x-0 bottom-0 bg-moss-900/55 px-2 py-1 text-xs font-semibold text-parchment-50">
              {p.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
