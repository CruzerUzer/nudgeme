import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAdmin, getUserId } from "@/lib/api";
import {
  adminListUsers,
  adminCreateUser,
  adminResetPassword,
  adminSetRole,
  adminRenameUser,
  adminDeleteUser,
  adminSetRegistration,
  adminTestNudge,
  getRegistrationOpen,
  type AdminUser,
} from "@/lib/serverAuth";

export default function Admin() {
  const navigate = useNavigate();
  const me = getUserId();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [regOpen, setRegOpen] = useState(true);
  const [newName, setNewName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (!isAdmin()) {
      navigate("/");
      return;
    }
    void refresh();
    void getRegistrationOpen().then(setRegOpen);
  }, [navigate]);

  async function refresh() {
    try {
      setUsers(await adminListUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte hämta användare.");
    }
  }

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel.");
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await run(async () => {
      const r = await adminCreateUser(newName);
      setNotice(
        `Konto "${r.username}" skapat. Tillfälligt lösenord: ${r.defaultPassword} (måste bytas vid första inloggning).`,
      );
      setNewName("");
    });
    setBusy(false);
  }

  async function toggleRegistration() {
    await run(async () => {
      const r = await adminSetRegistration(!regOpen);
      setRegOpen(r.open);
    });
  }

  async function testNudge() {
    await run(async () => {
      const r = await adminTestNudge();
      setNotice(
        r.created
          ? `Ny aktivitet skapad på Hem.${r.pushed ? " Pushnotis skickad." : " (Ingen push – aktivera notiser på den här enheten och välj nivå 2–4.)"}`
          : "Ingen kvalificerad aktivitet att skicka just nu (alla kan vara frekvensbegränsade).",
      );
    });
  }

  async function saveRename(u: AdminUser) {
    await run(async () => {
      await adminRenameUser(u.id, editName);
      setEditingId(null);
    });
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl text-moss-700">Användare</h1>

      {/* Registrering på/av */}
      <section className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg text-moss-800">Nya registreringar</h2>
            <p className="text-sm text-moss-500">
              {regOpen
                ? "Nya kan skapa konto själva."
                : "Avstängt – bara admin kan skapa konton."}
            </p>
          </div>
          <button
            className={regOpen ? "btn-gold" : "btn-ghost"}
            onClick={toggleRegistration}
          >
            {regOpen ? "Stäng av" : "Slå på"}
          </button>
        </div>
      </section>

      {/* Testa notiser (skickar en aktivitet + push till ditt eget konto) */}
      <section className="card p-5">
        <h2 className="text-lg text-moss-800">Testa notiser</h2>
        <p className="mb-3 text-sm text-moss-500">
          Tvinga fram en ny aktivitet på Hem och skicka pushnotisen direkt till
          ditt eget konto.
        </p>
        <button className="btn-primary w-full" onClick={testNudge}>
          Skicka testnotis nu
        </button>
      </section>

      <form onSubmit={create} className="card space-y-3 p-5">
        <h2 className="text-lg text-moss-800">Skapa ny användare</h2>
        <input
          className="w-full rounded-2xl border border-parchment-200 bg-parchment-50 px-4 py-3 outline-none focus:ring-2 focus:ring-gold-500"
          placeholder="Användarnamn"
          autoCapitalize="none"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="btn-primary w-full disabled:opacity-40" disabled={busy || !newName.trim()}>
          Skapa konto
        </button>
      </form>

      {notice && (
        <p className="card border-gold-300 bg-gold-300/20 p-4 text-sm text-moss-700">
          {notice}
        </p>
      )}
      {error && <p className="text-sm text-blush-600">{error}</p>}

      <ul className="space-y-3">
        {users.map((u) => (
          <li key={u.id} className="card space-y-3 p-4">
            {editingId === u.id ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  className="flex-1 rounded-xl border border-parchment-200 bg-parchment-50 px-3 py-2 outline-none focus:ring-2 focus:ring-gold-500"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <button className="btn-primary px-4 py-2 text-sm" onClick={() => saveRename(u)}>
                  Spara
                </button>
                <button className="btn-ghost px-3 py-2 text-sm" onClick={() => setEditingId(null)}>
                  Avbryt
                </button>
              </div>
            ) : (
              <p className="text-moss-900">
                {u.username}
                {u.role === "admin" && (
                  <span className="ml-2 rounded-full bg-gold-300 px-2 py-0.5 text-xs font-bold text-gold-700">
                    admin
                  </span>
                )}
                {u.id === me && <span className="ml-2 text-xs text-moss-400">(du)</span>}
                {u.mustChangePassword && (
                  <span className="ml-2 text-xs text-moss-400">väntar på lösenordsbyte</span>
                )}
              </p>
            )}

            {editingId !== u.id && (
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-full bg-moss-50 px-3 py-1 text-xs font-semibold text-moss-700"
                  onClick={() =>
                    run(() => adminSetRole(u.id, u.role === "admin" ? "user" : "admin"))
                  }
                >
                  {u.role === "admin" ? "Ta bort admin" : "Gör till admin"}
                </button>
                <button
                  className="rounded-full bg-moss-50 px-3 py-1 text-xs font-semibold text-moss-700"
                  onClick={() => {
                    setEditingId(u.id);
                    setEditName(u.username);
                  }}
                >
                  Byt namn
                </button>
                <button
                  className="rounded-full bg-moss-50 px-3 py-1 text-xs font-semibold text-moss-700"
                  onClick={() =>
                    run(async () => {
                      const r = await adminResetPassword(u.id);
                      setNotice(
                        `Lösenordet för "${u.username}" nollställt. Nytt tillfälligt lösenord: ${r.defaultPassword}.`,
                      );
                    })
                  }
                >
                  Nollställ lösen
                </button>
                {u.id !== me && (
                  <button
                    className="rounded-full bg-blush-400/20 px-3 py-1 text-xs font-semibold text-blush-600"
                    onClick={() => {
                      if (confirm(`Ta bort "${u.username}" och all deras data?`))
                        void run(() => adminDeleteUser(u.id));
                    }}
                  >
                    Ta bort
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
