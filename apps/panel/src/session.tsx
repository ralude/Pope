// Sesión del personal en el panel (REQ-001-40): quién ha entrado, entrar y salir. La sesión
// vive en una cookie httpOnly que pone el nodo; el panel solo pregunta `GET /auth/me`.
import { type StaffProfile, staffProfileSchema } from '@pope/shared';
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { ApiClient, ApiError, SESSION_EXPIRED } from './api/client.js';

export type SessionState =
  | { status: 'loading' }
  | { status: 'out'; notice: string | null }
  | { status: 'in'; staff: StaffProfile };

interface SessionValue {
  state: SessionState;
  api: ApiClient;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  // Solo caduca una sesión abierta. Sin ella, un 401 es lo normal (p. ej. el `GET /auth/me`
  // de una comprobación ya descartada al montar dos veces en desarrollo) y no lleva aviso.
  const expire = useCallback(() => {
    setState((prev) => (prev.status === 'in' ? { status: 'out', notice: SESSION_EXPIRED } : prev));
  }, []);

  // Si una petición recibe 401, la sesión caducó o desactivaron al encargado: al login.
  const api = useMemo(() => new ApiClient({ onUnauthorized: expire }), [expire]);

  useEffect(() => {
    let cancelled = false;
    api.get('/auth/me', staffProfileSchema).then(
      (staff) => {
        if (!cancelled) setState({ status: 'in', staff });
      },
      (error: unknown) => {
        if (cancelled) return;
        // Sin sesión es lo normal al abrir el panel: no es un aviso.
        const notice = error instanceof ApiError && error.status !== 401 ? error.message : null;
        setState({ status: 'out', notice });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  const login = useCallback(
    async (username: string, password: string) => {
      const staff = await api.post('/auth/login', { username, password }, staffProfileSchema);
      setState({ status: 'in', staff });
    },
    [api],
  );

  const logout = useCallback(async () => {
    try {
      await api.send('POST', '/auth/logout');
    } finally {
      setState({ status: 'out', notice: null });
    }
  }, [api]);

  const value = useMemo(() => ({ state, api, login, logout }), [state, api, login, logout]);
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionValue {
  const value = use(SessionContext);
  if (!value) {
    throw new Error('useSession fuera de SessionProvider');
  }
  return value;
}

/** El miembro del personal que ha entrado; solo para pantallas detrás del login. */
export function useStaff(): StaffProfile {
  const { state } = useSession();
  if (state.status !== 'in') {
    throw new Error('useStaff sin sesión');
  }
  return state.staff;
}
