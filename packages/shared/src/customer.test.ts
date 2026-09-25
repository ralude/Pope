import { describe, expect, it } from 'vitest';

import {
  customerCreateRequestSchema,
  customerSearchQuerySchema,
  customerUsernameSchema,
  normalizeVenezuelanPhone,
} from './customer.js';

const valid = (body: object) => customerCreateRequestSchema.safeParse(body).success;

describe('usuario del cliente (REQ-001-02)', () => {
  it('admite letras, números, punto, guion y guion bajo, de 3 a 32', () => {
    for (const username of ['juan', 'Juan_23', 'maria.p', 'el-crack', 'abc', 'a'.repeat(32)]) {
      expect(customerUsernameSchema.safeParse(username).success).toBe(true);
    }
  });

  it('rechaza espacios, tildes, ñ y longitudes fuera de rango', () => {
    for (const username of ['ju', 'juan perez', 'josé', 'muñoz', 'a'.repeat(33), '']) {
      expect(customerUsernameSchema.safeParse(username).success).toBe(false);
    }
  });

  it('recorta los espacios de los extremos', () => {
    expect(customerUsernameSchema.parse('  juan ')).toBe('juan');
  });
});

describe('teléfono venezolano', () => {
  it('normaliza móviles y fijos a +58XXXXXXXXXX', () => {
    expect(normalizeVenezuelanPhone('0412-1234567')).toBe('+584121234567');
    expect(normalizeVenezuelanPhone('+58 412 123 45 67')).toBe('+584121234567');
    expect(normalizeVenezuelanPhone('0424.123.45.67')).toBe('+584241234567');
    expect(normalizeVenezuelanPhone('(0212) 555-1234')).toBe('+582125551234');
  });

  it('rechaza números que no son venezolanos o están incompletos', () => {
    for (const phone of ['0412-123456', '0512-1234567', '+34 612 345 678', '4121234567', 'abc']) {
      expect(normalizeVenezuelanPhone(phone)).toBeNull();
    }
  });
});

describe('alta de cliente (REQ-001-02)', () => {
  it('nombre y teléfono son opcionales', () => {
    expect(customerCreateRequestSchema.parse({ username: 'juan', password: '1234' })).toEqual({
      username: 'juan',
      password: '1234',
      name: null,
      phone: null,
    });
  });

  it('un nombre o teléfono vacío cuenta como sin dato', () => {
    const parsed = customerCreateRequestSchema.parse({
      username: 'juan',
      password: '1234',
      name: '  ',
      phone: '',
    });
    expect(parsed).toMatchObject({ name: null, phone: null });
  });

  it('normaliza el teléfono y recorta el nombre', () => {
    const parsed = customerCreateRequestSchema.parse({
      username: 'juan',
      password: '1234',
      name: ' Juan Pérez ',
      phone: '0412-1234567',
    });
    expect(parsed).toMatchObject({ name: 'Juan Pérez', phone: '+584121234567' });
  });

  it('exige una contraseña de al menos 4 caracteres', () => {
    expect(valid({ username: 'juan', password: '123' })).toBe(false);
    expect(valid({ username: 'juan', password: '1234' })).toBe(true);
  });

  it('rechaza un teléfono no venezolano', () => {
    expect(valid({ username: 'juan', password: '1234', phone: '+34 612 345 678' })).toBe(false);
  });
});

describe('búsqueda de clientes', () => {
  it('pagina de 50 en 50 por defecto y acepta los números como texto de la URL', () => {
    expect(customerSearchQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
    expect(customerSearchQuerySchema.parse({ q: ' juan ', limit: '10', offset: '20' })).toEqual({
      q: 'juan',
      limit: 10,
      offset: 20,
    });
    expect(customerSearchQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });
});
