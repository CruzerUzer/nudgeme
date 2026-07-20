// Appens logotyp/varumärkesmärke – lövet med transparent bakgrund (inuti appen).
// (App-/hemskärmsikonerna i public/icons behåller sin fyllda platta.)
export default function BrandMark({ className = "" }: { className?: string }) {
  return (
    <img
      src="/leaf-mark.png"
      alt=""
      aria-hidden
      className={`object-contain ${className}`}
    />
  );
}
