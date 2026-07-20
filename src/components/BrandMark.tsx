// Appens logotyp/varumärkesmärke – den nya favicon-ikonen (löv på vit platta).
// Ersätter den tidigare line-art-löv-ikonen på alla ställen.
export default function BrandMark({ className = "" }: { className?: string }) {
  return (
    <img
      src="/icons/icon-192.png"
      alt=""
      aria-hidden
      className={`rounded-[24%] object-contain ${className}`}
    />
  );
}
