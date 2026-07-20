import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAdmin } from "@/lib/api";
import { useApp } from "@/app/AppProvider";
import {
  listPacks,
  createPack,
  deletePack,
  uploadImage,
  bgUrl,
  BG_SCREENS,
  type BgPack,
} from "@/lib/backgrounds";

export default function BackgroundAdmin() {
  const navigate = useNavigate();
  const { reload } = useApp();
  const [packs, setPacks] = useState<BgPack[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin()) {
      navigate("/");
      return;
    }
    void refresh();
  }, [navigate]);

  async function refresh() {
    try {
      setPacks(await listPacks());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte hämta paket.");
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createPack(name);
      setName("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte skapa paketet.");
    }
  }

  async function onUpload(packId: string, screen: string, file: File) {
    setError(null);
    setBusy(`${packId}:${screen}`);
    try {
      await uploadImage(packId, screen, file);
      await refresh();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uppladdningen misslyckades.");
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(packId: string) {
    await deletePack(packId);
    await refresh();
    await reload();
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl text-moss-700">Bakgrundspaket</h1>

      <form onSubmit={onCreate} className="card space-y-3 p-5">
        <h2 className="text-lg text-moss-800">Nytt paket</h2>
        <input
          className="w-full rounded-2xl border border-parchment-200 bg-parchment-50 px-4 py-3 outline-none focus:ring-2 focus:ring-gold-500"
          placeholder="Paketnamn (t.ex. Gryningsskog)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn-primary w-full disabled:opacity-40" disabled={!name.trim()}>
          Skapa paket
        </button>
      </form>

      {error && <p className="text-sm text-blush-600">{error}</p>}

      {packs.map((pack) => (
        <section key={pack.id} className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg text-moss-800">
              {pack.name}
              {pack.builtin && (
                <span className="ml-2 text-xs text-moss-400">(medföljande)</span>
              )}
            </h2>
            {!pack.builtin && (
              <button
                className="text-sm text-blush-600"
                onClick={() => onDelete(pack.id)}
              >
                Ta bort
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {BG_SCREENS.map(({ key, label }) => {
              const img = pack.images.find((i) => i.screen === key);
              const isBusy = busy === `${pack.id}:${key}`;
              return (
                <label
                  key={key}
                  className="relative flex h-24 cursor-pointer items-end overflow-hidden rounded-2xl border border-parchment-200 bg-parchment-50"
                  style={
                    img
                      ? {
                          backgroundImage: `url("${bgUrl(img.url)}")`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                >
                  <span
                    className={`w-full px-2 py-1 text-xs font-semibold ${
                      img
                        ? "bg-moss-900/55 text-parchment-50"
                        : "text-moss-500"
                    }`}
                  >
                    {isBusy ? "Laddar…" : img ? `${label} ✓` : `${label} – ladda upp`}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onUpload(pack.id, key, f);
                    }}
                  />
                </label>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
