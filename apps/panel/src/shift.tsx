// Turno de caja de quien ha entrado (REQ-001-03, T17): las recargas, las ventas en caja y
// las sesiones temporales se cobran en él. El dueño no cobra, así que no tiene turno.
import { type CashShift, cashShiftSchema, currentShiftResponseSchema } from '@pope/shared';
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useSession, useStaff } from './session.js';

interface ShiftValue {
  /** ¿Cobra este miembro del personal? El dueño solo consulta. */
  canCharge: boolean;
  /** `undefined` mientras se pregunta al nodo; `null` sin turno abierto. */
  shift: CashShift | null | undefined;
  open: () => Promise<void>;
  close: () => Promise<void>;
}

const ShiftContext = createContext<ShiftValue | null>(null);

export function ShiftProvider({ children }: { children: ReactNode }) {
  const { api } = useSession();
  const staff = useStaff();
  const canCharge = staff.role !== 'dueno';
  const [shift, setShift] = useState<CashShift | null | undefined>(canCharge ? undefined : null);

  useEffect(() => {
    if (!canCharge) return;
    let cancelled = false;
    api.get('/shifts/current', currentShiftResponseSchema).then(
      (response) => {
        if (!cancelled) setShift(response.shift);
      },
      () => {
        // Sin respuesta, se trata como sin turno: el nodo dirá lo que falta al cobrar.
        if (!cancelled) setShift(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, canCharge]);

  const open = useCallback(async () => {
    setShift(await api.post('/shifts', undefined, cashShiftSchema));
  }, [api]);

  const close = useCallback(async () => {
    await api.post('/shifts/current/close', undefined, cashShiftSchema);
    setShift(null);
  }, [api]);

  const value = useMemo(() => ({ canCharge, shift, open, close }), [canCharge, shift, open, close]);
  return <ShiftContext value={value}>{children}</ShiftContext>;
}

export function useShift(): ShiftValue {
  const value = use(ShiftContext);
  if (!value) {
    throw new Error('useShift fuera de ShiftProvider');
  }
  return value;
}
