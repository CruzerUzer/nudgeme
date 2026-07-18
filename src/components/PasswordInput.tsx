import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";

// Lösenordsfält med öga för att visa/dölja lösenordet.
export default function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-parchment-200 bg-parchment-50 px-4 py-3 pr-12 outline-none focus:ring-2 focus:ring-gold-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Dölj lösenord" : "Visa lösenord"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-moss-500 hover:text-moss-700"
      >
        {show ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
      </button>
    </div>
  );
}
