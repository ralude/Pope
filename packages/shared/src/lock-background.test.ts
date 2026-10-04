import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { domainEventSchema } from './events.js';
import {
  backgroundSourceMimeSchema,
  isBackgroundSourceWithinLimits,
  lockBackgroundImageSchema,
  MAX_BACKGROUND_BYTES,
  MAX_BACKGROUND_SOURCE_BYTES,
} from './lock-background-image.js';
import {
  lockBackgroundMessageSchema,
  lockBackgroundProgressMessageSchema,
  lockBackgroundSnapshotSchema,
} from './lock-background.js';
import { nativeNodeToPcMessageSchema, nativeShellNotificationSchema } from './native-protocol.js';

const ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const TIME = '2026-10-04T20:00:00Z';
const actor = { kind: 'staff', staffId: ID, name: 'Ana' };
const image = {
  sha256: 'a'.repeat(64),
  size: 2_000_000,
  mimeType: 'image/webp',
  width: 1_920,
  height: 1_080,
};

describe('fondo global de bloqueo', () => {
  it('REQ-003-76: límites en bytes decimales y 40 millones de píxeles antes de decodificar', () => {
    expect(MAX_BACKGROUND_SOURCE_BYTES).toBe(10_000_000);
    expect(MAX_BACKGROUND_BYTES).toBe(2_000_000);
    expect(isBackgroundSourceWithinLimits(10_000_000, 8_000, 5_000)).toBe(true);
    expect(isBackgroundSourceWithinLimits(1, 7_680, 4_320)).toBe(true);
    for (const [size, width, height] of [
      [10_000_001, 1, 1],
      [1, 8_000, 5_001],
      [0, 1, 1],
      [1, 0, 1],
      [1, 1.5, 1],
      [1, NaN, 1],
      [1, Infinity, 1],
    ] as const) {
      expect(isBackgroundSourceWithinLimits(size, width, height)).toBe(false);
    }
    for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(backgroundSourceMimeSchema.safeParse(mime).success).toBe(true);
    }
  });

  it('REQ-003-71, REQ-003-76: WebP, tamaño y dimensiones enteros, hash canónico', () => {
    expect(lockBackgroundImageSchema.parse(image)).toEqual(image);
    for (const over of [
      { sha256: 'A'.repeat(64) },
      { sha256: 'a'.repeat(63) },
      { size: 2_000_001 },
      { size: 0 },
      { width: 1_921 },
      { height: 1_081 },
      { width: 1.5 },
      { mimeType: 'image/png' },
      { url: 'https://otro/fondo' },
      { bytes: 'data' },
    ]) {
      expect(lockBackgroundImageSchema.safeParse({ ...image, ...over }).success).toBe(false);
    }
  });

  it('REQ-003-70: estado inicial y eliminación conservan revisión y actor del cambio', () => {
    expect(
      lockBackgroundSnapshotSchema.parse({
        revision: 0,
        background: null,
        changedAt: null,
        changedBy: null,
      }).revision,
    ).toBe(0);
    for (const background of [image, null]) {
      expect(
        lockBackgroundSnapshotSchema.parse({
          revision: 1,
          background,
          changedAt: TIME,
          changedBy: actor,
        }).background,
      ).toEqual(background);
    }
    expect(
      lockBackgroundSnapshotSchema.safeParse({
        revision: 0,
        background: image,
        changedAt: null,
        changedBy: null,
      }).success,
    ).toBe(false);
  });

  it('REQ-003-72, REQ-003-75: mismo aviso para cambio y reconexión, sin bytes en WS', () => {
    for (const background of [image, null]) {
      const message = { type: 'lockBackground', revision: 2, background };
      expect(nativeNodeToPcMessageSchema.parse(message)).toEqual(message);
      expect(lockBackgroundMessageSchema.safeParse({ ...message, bytes: 'imagen' }).success).toBe(
        false,
      );
    }
  });

  it('REQ-003-73, REQ-003-74: progreso local no simula una sesión ni viene del nodo', () => {
    for (const fields of [
      { stage: 'downloading', percent: 100 },
      { stage: 'verifying' },
      { stage: 'ready' },
      { stage: 'failed', code: 'hash_mismatch' },
    ]) {
      const message = { type: 'backgroundProgress', revision: 2, ...fields };
      expect(lockBackgroundProgressMessageSchema.parse(message)).toEqual(message);
      expect(nativeShellNotificationSchema.parse(message)).toEqual(message);
      expect(nativeNodeToPcMessageSchema.safeParse(message).success).toBe(false);
    }
    expect(
      lockBackgroundProgressMessageSchema.safeParse({
        type: 'backgroundProgress',
        revision: 1,
        stage: 'downloading',
        percent: 101,
      }).success,
    ).toBe(false);
  });

  it('REQ-003-71: evento estricto de metadatos con actor, sin secreto ni imagen', () => {
    const event = {
      id: ID,
      type: 'lock_screen.background_changed',
      version: 1,
      actor,
      occurredAt: TIME,
      payload: { revision: 1, background: image },
    };
    expect(domainEventSchema.parse(event)).toEqual(event);
    expect(
      domainEventSchema.safeParse({ ...event, payload: { ...event.payload, bytes: 'imagen' } })
        .success,
    ).toBe(false);
    expect(z.toJSONSchema(lockBackgroundSnapshotSchema).anyOf).toBeDefined();
  });
});
