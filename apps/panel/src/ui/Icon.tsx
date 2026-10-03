// Iconos de trazo del diseño (20 px). Sin librería de iconos: el panel va ligero (ADR-0011).
const PATHS = {
  mapa: (
    <>
      <rect x="3" y="4" width="5" height="4" rx="1" />
      <rect x="10" y="4" width="5" height="4" rx="1" />
      <rect x="3" y="11" width="5" height="4" rx="1" />
      <rect x="10" y="11" width="5" height="4" rx="1" />
    </>
  ),
  clientes: (
    <>
      <circle cx="10" cy="7" r="3.5" />
      <path d="M3.5 17c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5" />
    </>
  ),
  caja: (
    <>
      <rect x="3" y="9" width="14" height="8" rx="1.5" />
      <path d="M5 9V5h7v4M14 6h2M6 13h2M10 13h4" />
    </>
  ),
  cierres: (
    <>
      <rect x="4.5" y="2.5" width="11" height="15" rx="1.5" />
      <path d="M7.5 7h5M7.5 10h5M7.5 13h3" />
    </>
  ),
  ajustes: (
    <>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
    </>
  ),
  inventario: (
    <>
      <path d="M3 6.5 10 3l7 3.5v7L10 17l-7-3.5z" />
      <path d="M3 6.5 10 10l7-3.5M10 10v7" />
    </>
  ),
  temporales: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4.5l3 2" />
    </>
  ),
  interrumpidas: (
    <>
      <path d="M10 3 18 17H2z" />
      <path d="M10 8v4M10 14.5v.5" />
    </>
  ),
  combos: (
    <>
      <rect x="3" y="5" width="14" height="10" rx="2" />
      <path d="M3 9h14M7 12.5h3" />
    </>
  ),
  tarifas: (
    <>
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M3 8.5h14M7 2.5v3M13 2.5v3" />
    </>
  ),
  personal: (
    <>
      <circle cx="7.5" cy="7.5" r="3" />
      <path d="M2 17c0-3 2.4-4.5 5.5-4.5S13 14 13 17" />
      <path d="M13 4.5a3 3 0 0 1 0 6M15.5 12.8c1.5.6 2.5 2 2.5 4.2" />
    </>
  ),
  turno: (
    <>
      <rect x="2.5" y="6" width="15" height="10" rx="2" />
      <path d="M7 6V4h6v2M10 9.5v3" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
