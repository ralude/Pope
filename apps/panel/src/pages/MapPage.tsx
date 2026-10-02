// Mapa de PCs. El mapa en vivo llega con T39; de momento es la pantalla de inicio vacía.
import { Frame } from '../ui/Frame.js';

export function MapPage() {
  return (
    <Frame title="Mapa">
      <div style={{ height: '100%', background: 'var(--map-bg)' }} />
    </Frame>
  );
}
