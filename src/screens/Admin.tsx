import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAdmin } from "@/lib/api";
import {
  adminListUsers,
  adminCreateUser,
  adminResetPassword,
  type AdminUser,
} from "@/lib/serverAuth";

export default function Admin() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [newName, setNewName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAdmin()) {
      navigate("/");
      return;
    }
    void refresh();
  }, [navigate]);

  async function refresh() {
    try {
      setUsers(await adminListUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte hämta användare.");
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const r = await adminCreateUser(newName);
      setNotice(
        `Konto "${r.username}" skapat. Tillfälligt lösenord: ${r.defaultPassword} (måste bytas vid första inloggning).`,
      );
      setNewName("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte skapa användaren.");
    } finally {
      setBusy(false);
    }
  }

  async function reset(u: AdminUser) {
    setError(null);
    setNotice(null);
    try {
      const r = await adminResetPassword(u.id);
      setNotice(
        `Lösenordet för "${u.username}" nollställt. Nytt tillfälligt lösenord: ${r.defaultPassword}.`,
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte nollställa lösenordet.");
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl text-moss-700">Användare</h1>

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
        <p className="text-xs text-moss-400">
          Kontot får ett tillfälligt lösenord som användaren tvingas byta vid
          första inloggningen.
        </p>
      </form>

      {notice && (
        <p className="card border-gold-300 bg-gold-300/20 p-4 text-sm text-moss-700">
          {notice}
        </p>
      )}
      {error && <p className="text-sm text-blush-600">{error}</p>}

      <ul className="space-y-3">
        {users.map((u) => (
          <li key={u.id} className="card flex items-center gap-3 p-4">
            <div className="flex-1">
              <p className="text-moss-900">
                {u.username}
                {u.role === "admin" && (
                  <span className="ml-2 rounded-full bg-gold-300 px-2 py-0.5 text-xs font-bold text-gold-700">
                    admin
                  </span>
                )}
              </p>
              {u.mustChangePassword && (
                <p className="text-xs text-moss-400">väntar på lösenordsbyte</p>
              )}
            </div>
            <button
              className="btn-ghost text-sm"
              onClick={() => reset(u)}
            >
              Nollställ lösen
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
