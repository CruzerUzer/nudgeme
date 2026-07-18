import { useState } from "react";
import { LeafIcon } from "@/components/icons";
import { registerUser, loginUser } from "@/lib/serverAuth";

// Inloggning/registrering för serverläge (användarnamn + lösenord).
export default function Auth({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isRegister) await registerUser(username, password);
      else await loginUser(username, password);
      onAuthed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6">
      <div className="mb-8 flex flex-col items-center text-center">
        <span className="animate-gentle-float text-moss-600">
          <LeafIcon className="h-14 w-14" />
        </span>
        <h1 className="mt-3 font-display text-3xl text-moss-700">NudgeMe</h1>
        <p className="mt-1 text-moss-500">
          {isRegister ? "Skapa ett konto och kom igång." : "Välkommen tillbaka."}
        </p>
      </div>

      <form onSubmit={submit} className="card space-y-4 p-6">
        <label className="block">
          <span className="text-sm text-moss-500">Användarnamn</span>
          <input
            autoFocus
            autoCapitalize="none"
            autoComplete="username"
            className="mt-1 w-full rounded-2xl border border-parchment-200 bg-parchment-50 px-4 py-3 outline-none focus:ring-2 focus:ring-gold-500"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm text-moss-500">Lösenord</span>
          <input
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            className="mt-1 w-full rounded-2xl border border-parchment-200 bg-parchment-50 px-4 py-3 outline-none focus:ring-2 focus:ring-gold-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="text-sm text-blush-600">{error}</p>}

        <button
          type="submit"
          className="btn-primary w-full disabled:opacity-40"
          disabled={busy || !username.trim() || !password}
        >
          {busy ? "Ett ögonblick…" : isRegister ? "Skapa konto" : "Logga in"}
        </button>
      </form>

      <button
        className="btn-ghost mx-auto mt-4"
        onClick={() => {
          setError(null);
          setMode(isRegister ? "login" : "register");
        }}
      >
        {isRegister ? "Har du redan ett konto? Logga in" : "Ny här? Skapa ett konto"}
      </button>
    </div>
  );
}
