import { NavLink, Outlet } from "react-router-dom";
import type { ReactNode } from "react";
import { HomeIcon, ListIcon, ClockIcon, ScrollIcon, SettingsIcon } from "./icons";

const NAV = [
  { to: "/", label: "Hem", Icon: HomeIcon, end: true },
  { to: "/aktiviteter", label: "Aktiviteter", Icon: ListIcon },
  { to: "/schema", label: "Schema", Icon: ClockIcon },
  { to: "/historik", label: "Historik", Icon: ScrollIcon },
  { to: "/installningar", label: "Inställningar", Icon: SettingsIcon },
];

export default function Layout() {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <main className="flex-1 px-5 pb-28 pt-6">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t
          border-parchment-200 bg-parchment-50/95 px-2 pb-[env(safe-area-inset-bottom)]
          pt-2 backdrop-blur"
        aria-label="Huvudmeny"
      >
        <ul className="flex items-stretch justify-between">
          {NAV.map(({ to, label, Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px]
                   font-semibold transition ${
                     isActive
                       ? "text-moss-700"
                       : "text-moss-500/60 hover:text-moss-600"
                   }`
                }
              >
                {({ isActive }) => (
                  <NavItem label={label} active={isActive}>
                    <Icon className="h-6 w-6" />
                  </NavItem>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function NavItem({
  children,
  label,
  active,
}: {
  children: ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <>
      <span
        className={`grid place-items-center rounded-full p-1 transition ${
          active ? "bg-moss-50 text-moss-700" : ""
        }`}
      >
        {children}
      </span>
      <span>{label}</span>
    </>
  );
}
