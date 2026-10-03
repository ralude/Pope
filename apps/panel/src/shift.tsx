// Caja de turno del local (REQ-001-03, REQ-005-44): las recargas, las ventas en caja y las
// sesiones temporales se cobran en ella. El dueño no cobra, así que no la abre. Abrir pide el
// fondo (REQ-005-40) con el diálogo "Abrir caja", que vive aquí para todas las pantallas.
import {
  type CashShift,
  cashShiftSchema,
  currentShiftResponseSchema,
  type OpeningCash,
} from '@pope/shared';
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { OpenCashDialog } from './caja/OpenCashDialog.js';
import { useSession, useStaff } from './session.js';

interface ShiftValue {
  /** ¿Cobra este miembro del personal? El dueño solo consulta. */
  canCharge: boolean;
  /** `undefined` mientras se pregunta al nodo; `null` sin turno abierto. */
  shift: CashShift | null | undefined;
  /** Abre el diálogo "Abrir caja" (fondo inicial). */
  startOpen: () => void;
  close: () => Promise<void>;
}

const ShiftContext = createContext<ShiftValue | null>(null);

export function ShiftProvider({ children }: { children: ReactNode }) {
  const { api } = useSession();
  const staff = useStaff();
  const canCharge = staff.role !== 'dueno';
  const [shift, setShift] = useState<CashShift | null | undefined>(canCharge ? undefined : null);
  const [opening, setOpening] = useState(false);

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

  const open = useCallback(
    async (fund: OpeningCash) => {
      setShift(await api.post('/shifts', fund, cashShiftSchema));
    },
    [api],
  );
  const startOpen = useCallback(() => {
    setOpening(true);
  }, []);
  const stopOpening = useCallback(() => {
    setOpening(false);
  }, []);

  const close = useCallback(async () => {
    await api.post('/shifts/current/close', undefined, cashShiftSchema);
    setShift(null);
  }, [api]);

  const value = useMemo(
    () => ({ canCharge, shift, startOpen, close }),
    [canCharge, shift, startOpen, close],
  );
  return (
    <ShiftContext value={value}>
      {children}
      {opening && <OpenCashDialog onOpen={open} onClose={stopOpening} />}
    </ShiftContext>
  );
}

export function useShift(): ShiftValue {
  const value = use(ShiftContext);
  if (!value) {
    throw new Error('useShift fuera de ShiftProvider');
  }
  return value;
}
