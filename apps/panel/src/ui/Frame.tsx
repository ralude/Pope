// Marco de todas las pantallas del panel (diseño estilo SENET): barra superior con la fecha,
// la hora y quién ha entrado; raíl de iconos a la izquierda; cabecera de sección.
import { LOCAL_TIME_ZONE, type StaffRole } from '@pope/shared';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';

import { usePcMapFeed } from '../map/channel.js';
import { useSession, useStaff } from '../session.js';
import { Icon, type IconName } from './Icon.js';
import { RatePill } from './RatePill.js';
import { ShiftPill } from './ShiftPill.js';

/** Secciones del raíl. Cada tarea de la fase 8 añade la suya; `roles` limita quién la ve. */
const SECTIONS: { href: string; label: string; icon: IconName; roles?: StaffRole[] }[] = [
  { href: '/', label: 'Mapa de PCs', icon: 'mapa' },
  { href: '/clientes', label: 'Clientes', icon: 'clientes' },
  { href: '/caja', label: 'Caja', icon: 'caja' },
  { href: '/inventario', label: 'Inventario', icon: 'inventario' },
  {
    href: '/cierres',
    label: 'Cierres de caja',
    icon: 'cierres',
    roles: ['administrador', 'dueno'],
  },
  { href: '/interrumpidas', label: 'Interrumpidas', icon: 'interrumpidas' },
  { href: '/combo-horas', label: 'Combos', icon: 'combos' },
  { href: '/tarifas', label: 'Tarifas', icon: 'tarifas' },
  { href: '/personal', label: 'Personal', icon: 'personal', roles: ['administrador'] },
];

const ROLE_LABEL: Record<StaffRole, string> = {
  encargado: 'Encargado',
  administrador: 'Administrador',
  dueno: 'Dueño',
};

// Fecha y hora del local, aunque el navegador esté en otra zona (AGENTS.md: fechas en UTC,
// mostradas en la zona de quien mira; en el local, Caracas).
const dateFormat = new Intl.DateTimeFormat('es-VE', {
  timeZone: LOCAL_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('es-VE', {
  timeZone: LOCAL_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Hora que se refresca cada 15 s: basta para los minutos y no carga la gráfica. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 15_000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

function TopBar() {
  const staff = useStaff();
  const { logout } = useSession();
  const now = useNow();
  return (
    <header className="topbar">
      <div className="brand">POPE</div>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {dateFormat.format(now)}
        </span>
        <span className="num" style={{ fontSize: 17, fontWeight: 700 }}>
          {timeFormat.format(now)}
        </span>
      </div>
      <RatePill />
      <div style={{ flexGrow: 1 }} />
      <ShiftPill />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="avatar" aria-hidden="true">
          {staff.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ fontWeight: 700 }}>{staff.displayName}</span>
          <span className="muted" style={{ fontSize: 12 }}>
            {ROLE_LABEL[staff.role]}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ height: 34, padding: '0 14px', fontSize: 13 }}
          onClick={() => {
            void logout();
          }}
        >
          Salir
        </button>
      </div>
    </header>
  );
}

function Rail() {
  const [location] = useLocation();
  const staff = useStaff();
  const { pendingInterrupted } = usePcMapFeed();
  return (
    <nav className="rail" aria-label="Secciones">
      {SECTIONS.filter((section) => !section.roles || section.roles.includes(staff.role)).map(
        (section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rail-item"
            aria-label={
              section.href === '/interrumpidas' && (pendingInterrupted ?? 0) > 0
                ? `${section.label}: ${String(pendingInterrupted)} pendientes`
                : section.label
            }
            title={section.label}
            aria-current={location === section.href ? 'page' : undefined}
          >
            <Icon name={section.icon} size={22} />
            {section.href === '/interrumpidas' && (pendingInterrupted ?? 0) > 0 && (
              <span className="rail-dot" />
            )}
          </Link>
        ),
      )}
    </nav>
  );
}

export function Frame({
  title,
  tabs,
  actions,
  children,
}: {
  title: string;
  tabs?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="app">
      <TopBar />
      <div className="app-body">
        <Rail />
        <main className="section">
          <div className="section-header">
            <h1 className="section-title">{title}</h1>
            {tabs}
            <div style={{ flexGrow: 1 }} />
            {actions}
          </div>
          <div className="section-body">{children}</div>
        </main>
      </div>
    </div>
  );
}
