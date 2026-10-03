// Caja de turno del local (REQ-001-03, REQ-005-44): las recargas, las ventas en caja y las
// sesiones temporales se cobran en ella. El dueño no cobra, así que no la abre. Abrir pide el
// fondo (REQ-005-40) con el diálogo "Abrir caja", que vive aquí para todas las pantallas.
import {
  type CashByMethod,
  type CashShift,
  cashShiftSchema,
  currentShiftResponseSchema,
  type OpeningCash,
  type ShiftSummary,
  shiftSummarySchema,
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

import { CloseCashDialog } from './caja/CloseCashDialog.js';
import { OpenCashDialog } from './caja/OpenCashDialog.js';
import { useSession, useStaff } from './session.js';

interface ShiftValue {
  /** ¿Cobra este miembro del personal? El dueño solo consulta. */
  canCharge: boolean;
  /** `undefined` mientras se pregunta al nodo; `null` sin turno abierto. */
  shift: CashShift | null | undefined;
  /** Abre el diálogo "Abrir caja" (fondo inicial). */
  startOpen: () => void;
  /** Abre el diálogo "Cerrar caja" (conteo, confirmación y reporte). */
  startClose: () => void;
}

const ShiftContext = createContext<ShiftValue | null>(null);

export function ShiftProvider({ children }: { children: ReactNode }) {
  const { api } = useSession();
  const staff = useStaff();
  const canCharge = staff.role !== 'dueno';
  const [shift, setShift] = useState<CashShift | null | undefined>(canCharge ? undefined : null);
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);

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

  const close = useCallback(
    async (counted: CashByMethod): Promise<ShiftSummary> => {
      const summary = await api.post('/shifts/current/close', { counted }, shiftSummarySchema);
      setShift(null);
      return summary;
    },
    [api],
  );
  const startClose = useCallback(() => {
    setClosing(true);
  }, []);
  const stopClosing = useCallback(() => {
    setClosing(false);
  }, []);

  const value = useMemo(
    () => ({ canCharge, shift, startOpen, startClose }),
    [canCharge, shift, startOpen, startClose],
  );
  return (
    <ShiftContext value={value}>
      {children}
      {opening && <OpenCashDialog onOpen={open} onClose={stopOpening} />}
      {closing && <CloseCashDialog close={close} onClose={stopClosing} />}
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
