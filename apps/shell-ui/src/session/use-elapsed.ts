// Segundos pasados desde que llegó el `state` (T47): entre un `state` y otro, las pantallas
// descuentan el tiempo con este contador, sin fiarse del reloj de la PC.
import { useEffect, useState } from 'react';

/** Segundos desde `since` (`performance.now()`), refrescados cada segundo. */
export function useElapsed(since: number): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    setNow(performance.now());
    const timer = setInterval(() => {
      setNow(performance.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [since]);
  return Math.max(0, (now - since) / 1000);
}
