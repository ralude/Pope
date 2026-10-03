import {
  type CashMovement,
  type CurrentShiftResponse,
  type Customer,
  type Product,
  type SaleConcept,
  usd,
} from '@pope/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { PcWorld } from '../testing/pc-world.js';
import { pdfPageCount, pdfTexts } from '../testing/pdf-text.js';
import { NOTHING_COUNTED } from '../testing/shifts.js';

// Lunes 28 de septiembre de 2026, 18:00 en Caracas: la hora sale a 1,50 USD.
const MONDAY = '2026-09-28T22:00:00Z';

describe('reportes del cierre en PDF (e2e, REQ-005-51 a REQ-005-53)', () => {
  let world: PcWorld;
  let ana: string;
  let admin: string;
  let owner: string;
  let juan: Customer;
  let papas: Product;
  let impresiones: SaleConcept;
  let shiftId: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    ana = await world.cashier();
    admin = await loginAsStaff(world.testApp, 'admin', 'administrador', 'Luis');
    owner = await loginAsStaff(world.testApp, 'duena', 'dueno', 'Dueña');
    juan = await createCustomerWithBalance(world.testApp, 'juan');
    await world.api('PUT', '/settings', admin, { localName: 'Ciber Ana' });
    papas = (
      await world.api('POST', '/products', admin, {
        name: 'Papas',
        priceMicros: usd(1.5),
        minStock: null,
        initialQuantity: 10,
      })
    ).json<Product>();
    impresiones = (
      await world.api('POST', '/sale-concepts', admin, {
        name: 'Impresiones',
        unitPriceMicros: usd(0.1),
      })
    ).json<SaleConcept>();
    shiftId =
      (await world.api('GET', '/shifts/current', ana)).json<CurrentShiftResponse>().shift?.id ?? '';
  });

  afterEach(async () => {
    await world.close();
  });

  const sell = (lines: object[], usdMicros: number) =>
    world.api('POST', '/sales', ana, {
      lines,
      payments: [{ method: 'cash_usd', usdMicros }],
      customerId: null,
    });

  /** CA-005-09: 10,00 en temporales, 5,00 en recargas, 3,00 en golosinas y 1,20 en impresiones. */
  async function sellTheDay(): Promise<CashMovement> {
    await world.pc(5);
    const temporary = await world.api('POST', '/sessions/temporary', ana, {
      pcId: devPcId(5),
      paymentMethod: 'cash_usd',
      minutes: 400,
      name: 'Carlos',
    });
    expect(temporary.statusCode).toBe(201);
    await world.api('POST', `/customers/${juan.id}/recharges`, ana, {
      amountMicros: usd(5),
      paymentMethod: 'cash_usd',
    });
    const snacks = await sell([{ kind: 'product', productId: papas.id, quantity: 2 }], usd(3));
    await sell(
      [{ kind: 'concept', conceptId: impresiones.id, quantity: 12, unitPriceMicros: usd(0.1) }],
      usd(1.2),
    );
    return snacks.json<CashMovement>();
  }

  const download = (cookie: string, full = false) =>
    world.api('GET', `/shifts/${shiftId}/report.pdf${full ? '?full=1' : ''}`, cookie);

  it('CA-005-09: al cerrar, el PDF de una página trae horas de PC, golosinas, otras ventas y total', async () => {
    await sellTheDay();
    expect(
      (await world.api('POST', '/shifts/current/close', ana, NOTHING_COUNTED)).statusCode,
    ).toBe(200);
    const response = await download(ana);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="cierre-caja-2026-09-28.pdf"',
    );
    const pdf = response.rawPayload;
    expect(pdfPageCount(pdf)).toBe(1);
    const texts = pdfTexts(pdf);
    expect(texts).toContain('Ciber Ana');
    expect(texts).toContain('Encargado: Ana');
    const expected: [string, string][] = [
      ['Horas de PC', '15,00 USD'],
      ['Golosinas', '3,00 USD'],
      ['Otras ventas', '1,20 USD'],
      ['Total', '19,20 USD'],
    ];
    for (const [label, amount] of expected) {
      const at = texts.indexOf(label);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(texts[at + 1]).toBe(amount);
    }
    // El cuadre: con nada contado, en efectivo faltan los 19,20 USD.
    expect(texts).toContain('-19,20 USD');
    // El resumen nunca lleva la lista de movimientos (plan 005, riesgos).
    expect(texts).not.toContain('Impresiones × 12');
    // REQ-005-51: lo vendido por artículo, como el Z-Report de SENET: cantidad y en almacén
    // (las otras ventas no llevan stock).
    const sold = texts.slice(texts.indexOf('Lo vendido por artículo'));
    expect(sold.slice(1, 4)).toEqual(['Artículo', 'Cantidad vendida', 'En almacén']);
    expect(sold.slice(4, 10)).toEqual(['Impresiones', '12', '—', 'Papas', '2', '8']);
  });

  it('REQ-005-53: el detallado lleva los movimientos, las anulaciones con su motivo y el stock', async () => {
    const snacks = await sellTheDay();
    await world.api('POST', `/sales/${snacks.sourceId}/void`, admin, { reason: 'error de cobro' });
    const response = await download(owner, true);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toContain('cierre-caja-detallado-2026-09-28');
    const texts = pdfTexts(response.rawPayload);
    expect(texts).toContain('Impresiones × 12');
    expect(texts).toContain('Sesión temporal · PC 05 · Carlos');
    expect(texts).toContain('Papas × 2 (anulada)');
    expect(texts.some((t) => t.includes('Motivo: error de cobro'))).toBe(true);
    // Papas se dio de alta con la caja ya abierta: sus 10 son una entrada de esta caja; las 2
    // vendidas volvieron al anular.
    const at = texts.indexOf('Papas');
    expect(texts.slice(at, at + 7)).toEqual(['Papas', '0', '10', '0', '0', '0', '10']);
    // Con la venta anulada, las golosinas suman 0.
    const snacksAt = texts.indexOf('Golosinas');
    expect(texts[snacksAt + 1]).toBe('0,00 USD');
    // Y la venta anulada no cuenta en lo vendido por artículo (REQ-005-51).
    const sold = texts.slice(
      texts.indexOf('Lo vendido por artículo'),
      texts.indexOf('Movimientos de la caja'),
    );
    expect(sold).toContain('Impresiones');
    expect(sold).not.toContain('Papas');
  });

  it('el encargado descarga el resumen de sus cajas, pero no el detallado ni el de otros', async () => {
    const eva = await loginAsStaff(world.testApp, 'eva', 'encargado', 'Eva');
    expect((await download(ana)).statusCode).toBe(200);
    expect((await download(ana, true)).statusCode).toBe(403);
    expect((await download(eva)).statusCode).toBe(403);
    expect((await download(admin, true)).statusCode).toBe(200);
    expect((await download(owner)).statusCode).toBe(200);
    const missing = await world.api(
      'GET',
      '/shifts/0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4aff/report.pdf',
      owner,
    );
    expect(missing.statusCode).toBe(404);
  });
});
