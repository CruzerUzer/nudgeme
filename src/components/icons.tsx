// Enkla, linjebaserade ikoner i alvisk anda. currentColor så de ärver tema.
type P = { className?: string };

export const LeafIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path
      d="M4 20c0-8 6-14 16-16-1 10-6 16-14 16-1 0-2-.3-2-.3S4 20 4 20Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M6 18C10 14 14 10 18 6" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

export const HomeIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path
      d="M4 11l8-7 8 7M6 10v9h12v-9"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ListIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path
      d="M8 7h11M8 12h11M8 17h11M4 7h.01M4 12h.01M4 17h.01"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export const ClockIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M12 8v4.2l2.8 1.8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export const ScrollIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path
      d="M7 4h9a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 0-2-2Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M9 9h6M9 13h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const SettingsIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export const SparkleIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path
      d="M12 3c.6 4 2 5.4 6 6-4 .6-5.4 2-6 6-.6-4-2-5.4-6-6 4-.6 5.4-2 6-6Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path d="M19 14c.3 1.6.8 2.1 2 2.5-1.2.4-1.7.9-2 2.5-.3-1.6-.8-2.1-2-2.5 1.2-.4 1.7-.9 2-2.5Z" fill="currentColor" opacity=".7" />
  </svg>
);
