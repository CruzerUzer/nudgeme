import { useEffect } from "react";
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

  // Förladda ALLA skärmars bakgrunder när paketet laddats, så att byte av skärm
  // känns direkt (bilderna ligger redan i webbläsarens cache).
  useEffect(() => {
    for (const u of Object.values(backgroundImages)) {
      const img = new Image();
      img.src = u;
    }
  }, [backgroundImages]);

  const url = backgroundImages[routeToScreen(pathname)];
  if (!url) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
        style={{ backgroundImage: `url("${url}")` }}
      />
      {/* Lättare scrim (40 %) utan blur – bilden syns mer, texten förblir läsbar */}
      <div className="absolute inset-0 bg-parchment-100/40" />
    </div>
  );
}
