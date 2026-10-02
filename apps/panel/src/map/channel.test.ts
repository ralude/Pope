import { describe, expect, it } from 'vitest';

import { parsePanelMessage } from './channel.js';

describe('mensajes del canal del panel (T39)', () => {
  it('acepta el mapa completo', () => {
    const map = { pcs: [], at: '2026-09-28T22:10:00.000Z' };
    expect(parsePanelMessage(JSON.stringify({ type: 'pcs', map }))).toEqual({ type: 'pcs', map });
  });

  it('descarta lo que no es JSON, no es texto o no cumple el esquema', () => {
    expect(parsePanelMessage('{roto')).toBeNull();
    expect(parsePanelMessage(new ArrayBuffer(2))).toBeNull();
    expect(parsePanelMessage(JSON.stringify({ type: 'pcs', map: { pcs: 'no' } }))).toBeNull();
    expect(parsePanelMessage(JSON.stringify({ type: 'otro' }))).toBeNull();
  });
});
