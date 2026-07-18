import { useState } from "react";
import { LeafIcon } from "@/components/icons";
import { isStandalone } from "@/lib/push";

const STEPS = [
  {
    title: "Välkommen till NudgeMe",
    body: "En vänlig liten skog som viskar fram roliga saker du annars glömmer bort. Inga krav, ingen stress – bara knuffar.",
  },
  {
    title: "Du bestämmer takten",
    body: "Välj tidsspann per veckodag och hur ofta. Aktiviteterna kommer på slumpad tid – som fjärilar, när man minst anar det.",
  },
  {
    title: "Sällan blir speciellt",
    body: "Dela in aktiviteter i A–D. A kommer ofta, D är sällsynta äventyr. Du styr själva takten i inställningarna.",
  },
];

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const showIosTip = last && !isStandalone() && isIos();

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-parchment-100 px-6 text-center">
      <span className="animate-gentle-float mb-6 text-moss-600">
        <LeafIcon className="h-16 w-16" />
      </span>
      <h1 className="font-display text-3xl text-moss-700">{STEPS[step].title}</h1>
      <p className="mt-3 max-w-sm text-moss-600">{STEPS[step].body}</p>

      {showIosTip && (
        <div className="card mt-6 max-w-sm p-4 text-sm text-moss-600">
          <strong className="text-moss-800">Tips för iPhone:</strong> för att få
          notiser, tryck på Dela-ikonen och välj{" "}
          <em>”Lägg till på hemskärmen”</em>. Öppna NudgeMe därifrån.
        </div>
      )}

      <div className="mt-8 flex items-center gap-2">
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={`h-2 rounded-full transition-all ${
              i === step ? "w-6 bg-moss-600" : "w-2 bg-moss-300"
            }`}
          />
        ))}
      </div>

      <button
        className="btn-primary mt-8 w-full max-w-sm"
        onClick={() => (last ? onDone() : setStep(step + 1))}
      >
        {last ? "Kom igång" : "Vidare"}
      </button>
      {!last && (
        <button className="btn-ghost mt-2" onClick={onDone}>
          Hoppa över
        </button>
      )}
    </div>
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
