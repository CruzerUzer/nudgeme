import { useState } from "react";
import BrandMark from "@/components/BrandMark";
import PasswordInput from "@/components/PasswordInput";
import { changePassword } from "@/lib/serverAuth";

/** Formulär för att byta lösenord. Återanvänds i inställningar och tvingat byte. */
export function ChangePasswordForm({
  oldLabel = "Nuvarande lösenord",
  onDone,
}: {
  oldLabel?: string;
  onDone: () => void;
}) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPw.length < 6) return setError("Nytt lösenord måste vara minst 6 tecken.");
    if (newPw !== confirm) return setError("Lösenorden matchar inte.");
    setBusy(true);
    try {
      await changePassword(oldPw, newPw);
      setOk(true);
      setOldPw("");
      setNewPw("");
      setConfirm("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm text-moss-500">{oldLabel}</span>
        <PasswordInput value={oldPw} onChange={setOldPw} autoComplete="current-password" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm text-moss-500">Nytt lösenord</span>
        <PasswordInput value={newPw} onChange={setNewPw} autoComplete="new-password" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm text-moss-500">Bekräfta nytt lösenord</span>
        <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
      </label>
      {error && <p className="text-sm text-blush-600">{error}</p>}
      {ok && <p className="text-sm text-moss-600">Lösenordet är bytt. ✨</p>}
      <button
        type="submit"
        className="btn-primary w-full disabled:opacity-40"
        disabled={busy || !oldPw || !newPw}
      >
        {busy ? "Ett ögonblick…" : "Byt lösenord"}
      </button>
    </form>
  );
}

/** Helskärm som tvingar lösenordsbyte vid första inloggning. */
export default function ForceChangePassword({ onDone }: { onDone: () => void }) {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6">
      <div className="mb-8 flex flex-col items-center text-center">
        <BrandMark className="h-14 w-14" />
        <h1 className="mt-3 font-display text-3xl text-moss-700">Välj ett eget lösenord</h1>
        <p className="mt-1 text-moss-500">
          Ditt konto skapades med ett tillfälligt lösenord. Byt det för att fortsätta.
        </p>
      </div>
      <div className="card p-6">
        <ChangePasswordForm oldLabel="Tillfälligt lösenord" onDone={onDone} />
      </div>
    </div>
  );
}
