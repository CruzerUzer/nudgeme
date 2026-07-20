import { useLocation } from "react-router-dom";
import { useApp } from "@/app/AppProvider";

// Fast bakgrundslager som byter bild efter aktuell skärm. Ett pergament-scrim
// läggs över så texten förblir läsbar (jfr "Atmospheric Layering" i DESIGN.md).

function routeToScreen(path: string): string {
  if (path.startsWith("/aktiviteter")) return "activities";
  if (path.startsWith("/schema")) return "schedule";
  if (path.startsWith("/historik")) return "history";
  if (path.startsWith("/installningar") || path.startsWith("/admin")) return "settings";
  return "home";
}

export default function Background() {
  const { backgroundImages } = useApp();
  const { pathname } = useLocation();
  const url = backgroundImages[routeToScreen(pathname)];
  if (!url) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
        style={{ backgroundImage: `url("${url}")` }}
      />
      {/* Scrim för läsbarhet – släpper igenom bilden men håller texten läsbar */}
      <div className="absolute inset-0 bg-parchment-100/60 backdrop-blur-[1px]" />
    </div>
  );
}
