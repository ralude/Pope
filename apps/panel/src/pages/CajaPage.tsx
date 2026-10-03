// Caja (spec 005, REQ-005-20): como en SENET, el catálogo a la izquierda (golosinas con su foto
// y otras ventas con cantidad y precio) y la venta nueva al lado, con su total en USD y Bs. El
// cobro va debajo del total (T20b) y los movimientos del turno, a la derecha (T21).
import '../caja/caja.css';

import {
  formatBolivares,
  formatLocalTime,
  formatMoney,
  lineTotal,
  type Micros,
  type Product,
  productPhotoPath,
  productSchema,
  type SaleConcept,
  saleConceptSchema,
  settingsSchema,
} from '@pope/shared';
import { useEffect, useState } from 'react';

import { ApiError, listOf } from '../api/client.js';
import {
  addConcept,
  addProduct,
  availability,
  type CartLine,
  cartLineTotal,
  cartTotal,
  changeQuantity,
  quantityInCart,
} from '../caja/model.js';
import { Checkout } from '../caja/Checkout.js';
import { MovementList } from '../caja/MovementList.js';
import { filterByName, initials } from '../inventory/model.js';
import { usePcMapFeed } from '../map/channel.js';
import { useSession, useStaff } from '../session.js';
import { useShift } from '../shift.js';
import { Frame } from '../ui/Frame.js';
import { formatUsdInput, parseUsd } from '../ui/money.js';

const productsSchema = listOf(productSchema);
const conceptsSchema = listOf(saleConceptSchema);

function errorMessage(failure: unknown): string {
  return failure instanceof ApiError ? failure.message : String(failure);
}

export function CajaPage() {
  const { api } = useSession();
  const { canCharge, shift, startOpen } = useShift();
  const staff = useStaff();
  const { rate, cashVersion } = usePcMapFeed();
  const vesRate = rate?.rate?.vesPerUsd;
  const [products, setProducts] = useState<Product[]>([]);
  const [concepts, setConcepts] = useState<SaleConcept[]>([]);
  const [allowNegative, setAllowNegative] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<'snacks' | 'other'>('snacks');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [lastSale, setLastSale] = useState<string | null>(null);

  // El catálogo, al entrar y con cada cambio de stock o de precios (`cash`).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get('/products', productsSchema),
      api.get('/sale-concepts', conceptsSchema),
      api.get('/settings', settingsSchema),
    ]).then(
      ([productList, conceptList, settings]) => {
        if (cancelled) return;
        setProducts(productList.filter((p) => p.active));
        setConcepts(conceptList.filter((c) => c.active));
        setAllowNegative(settings.allowNegativeStock === 1);
        setLoadError(null);
      },
      (failure: unknown) => {
        if (!cancelled) setLoadError(errorMessage(failure));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, cashVersion]);

  const total = cartTotal(cart);

  return (
    <Frame
      title="Caja"
      tabs={
        <span className="muted">
          {shift
            ? `Caja abierta desde las ${formatLocalTime(new Date(shift.openedAt))}`
            : shift === null
              ? 'La caja está cerrada'
              : ''}
        </span>
      }
      actions={
        canCharge &&
        shift === null && (
          <button type="button" className="btn btn-primary" onClick={startOpen}>
            Abrir caja
          </button>
        )
      }
    >
      <div className="caja-layout">
        <section className="caja-catalog" aria-label="Catálogo">
          <div className="caja-catalog-head">
            <div style={{ display: 'flex', gap: 4 }}>
              {(
                [
                  ['snacks', 'Golosinas'],
                  ['other', 'Otras ventas'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="section-tab"
                  aria-pressed={tab === value}
                  onClick={() => {
                    setTab(value);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="search"
              className="input caja-search"
              placeholder="Buscar"
              aria-label="Buscar en el catálogo"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
          </div>
          {loadError && (
            <div role="alert" className="alert-error">
              {loadError}
            </div>
          )}
          {tab === 'snacks' ? (
            <Snacks
              products={filterByName(products, query)}
              cart={cart}
              allowNegative={allowNegative}
              onAdd={(product) => {
                setCart((prev) => addProduct(prev, product));
              }}
            />
          ) : (
            <OtherSales
              concepts={filterByName(concepts, query)}
              onAdd={(concept, quantity, price) => {
                setCart((prev) => addConcept(prev, concept, quantity, price));
              }}
            />
          )}
        </section>

        <section className="card caja-sale" aria-label="Venta nueva">
          <h2 className="detail-title" style={{ margin: 0 }}>
            Venta nueva
          </h2>
          <div className="caja-lines">
            {cart.length === 0 && (
              <span className="muted">Elige golosinas u otras ventas a la izquierda.</span>
            )}
            {cart.map((line, index) => (
              <div
                key={`${line.kind}-${line.name}-${String(line.unitPriceMicros)}`}
                className="caja-line"
              >
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div className="caja-line-name">{line.name}</div>
                  <div className="muted num" style={{ fontSize: 12 }}>
                    {formatMoney(line.unitPriceMicros)} c/u
                  </div>
                </div>
                <button
                  type="button"
                  className="caja-step"
                  aria-label={`Quitar uno de ${line.name}`}
                  onClick={() => {
                    setCart((prev) => changeQuantity(prev, index, -1));
                  }}
                >
                  −
                </button>
                <span className="num" style={{ width: 26, textAlign: 'center' }}>
                  {line.quantity}
                </span>
                <button
                  type="button"
                  className="caja-step"
                  aria-label={`Añadir uno de ${line.name}`}
                  onClick={() => {
                    setCart((prev) => changeQuantity(prev, index, 1));
                  }}
                >
                  +
                </button>
                <span className="num" style={{ width: 76, textAlign: 'right' }}>
                  {formatMoney(cartLineTotal(line))}
                </span>
              </div>
            ))}
          </div>
          <div className="caja-total">
            <span className="muted">Total</span>
            <div style={{ textAlign: 'right' }}>
              <div className="num" style={{ fontSize: 26 }}>
                {formatMoney(total)}
              </div>
              {vesRate !== undefined && (
                <div className="muted num" style={{ fontSize: 12 }}>
                  {formatBolivares(total, vesRate)}
                </div>
              )}
            </div>
          </div>
          <Checkout
            cart={cart}
            total={total}
            vesRate={vesRate}
            shiftOpen={Boolean(shift)}
            onSold={(movement) => {
              setCart([]);
              setLastSale(`Cobrado: ${movement.description} · ${formatMoney(movement.usdMicros)}`);
            }}
          />
          {lastSale && cart.length === 0 && (
            <span role="status" className="field-hint">
              {lastSale}
            </span>
          )}
        </section>
        <MovementList
          shiftId={shift?.id ?? null}
          cashVersion={cashVersion}
          isAdmin={staff.role === 'administrador'}
        />
      </div>
    </Frame>
  );
}

function Snacks({
  products,
  cart,
  allowNegative,
  onAdd,
}: {
  products: Product[];
  cart: CartLine[];
  allowNegative: boolean;
  onAdd: (product: Product) => void;
}) {
  if (products.length === 0) {
    return <span className="muted">No hay golosinas a la venta.</span>;
  }
  return (
    <div className="caja-grid">
      {products.map((product) => {
        const left = availability(product, quantityInCart(cart, product.id));
        const blocked = left.tone === 'out' && !allowNegative;
        const photo = productPhotoPath(product);
        return (
          <button
            key={product.id}
            type="button"
            className="caja-product"
            disabled={blocked}
            aria-label={`Añadir ${product.name}`}
            onClick={() => {
              onAdd(product);
            }}
          >
            {photo ? (
              <img className="caja-product-photo" src={photo} alt="" />
            ) : (
              <span className="caja-product-photo caja-product-initials" aria-hidden="true">
                {initials(product.name)}
              </span>
            )}
            <span className="caja-product-body">
              <span className="caja-line-name">{product.name}</span>
              <span className="num">{formatMoney(product.priceMicros)}</span>
              <span className={`caja-left caja-left-${left.tone}`}>{left.text}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function OtherSales({
  concepts,
  onAdd,
}: {
  concepts: SaleConcept[];
  onAdd: (concept: SaleConcept, quantity: number, price: Micros) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = concepts.find((c) => c.id === selectedId) ?? concepts[0];
  const [quantityText, setQuantityText] = useState('1');
  const [priceText, setPriceText] = useState('');
  // Al elegir otro concepto se propone su precio sugerido (REQ-005-05). Solo entonces: si se
  // refresca el catálogo, lo que haya escrito el encargado se queda.
  const selectedKey = selected?.id;
  const suggested = selected?.unitPriceMicros;
  useEffect(() => {
    if (suggested !== undefined) setPriceText(formatUsdInput(suggested));
  }, [selectedKey, suggested]);
  const quantity = /^\d{1,4}$/.test(quantityText.trim()) ? Number(quantityText.trim()) : 0;
  const price = parseUsd(priceText);
  const subtotal = price === null || quantity <= 0 ? null : lineTotal(quantity, price);

  if (concepts.length === 0 || !selected) {
    return <span className="muted">No hay otras ventas configuradas.</span>;
  }
  return (
    <div className="caja-concepts">
      {concepts.map((concept) => (
        <button
          key={concept.id}
          type="button"
          className="caja-concept"
          aria-pressed={concept.id === selected.id}
          onClick={() => {
            setSelectedId(concept.id);
            setQuantityText('1');
          }}
        >
          <span style={{ flexGrow: 1, textAlign: 'left', fontWeight: 700 }}>{concept.name}</span>
          <span className="muted num">{formatMoney(concept.unitPriceMicros)} c/u</span>
        </button>
      ))}
      <form
        className="card caja-concept-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (price === null || quantity <= 0) return;
          onAdd(selected, quantity, price);
          setQuantityText('1');
        }}
      >
        <strong>{selected.name}</strong>
        <div className="detail-grid">
          <div className="field">
            <label className="label" htmlFor="concepto-cantidad">
              Cantidad
            </label>
            <input
              id="concepto-cantidad"
              className="input num"
              inputMode="numeric"
              autoComplete="off"
              value={quantityText}
              onChange={(event) => {
                setQuantityText(event.target.value);
              }}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="concepto-precio-unidad">
              Precio por unidad (USD)
            </label>
            <input
              id="concepto-precio-unidad"
              className="input num"
              inputMode="decimal"
              autoComplete="off"
              value={priceText}
              onChange={(event) => {
                setPriceText(event.target.value);
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="muted num">
            {subtotal === null || price === null
              ? 'Escribe la cantidad y el precio.'
              : `${String(quantity)} × ${formatMoney(price)} = ${formatMoney(subtotal)}`}
          </span>
          <button type="submit" className="btn btn-primary" disabled={subtotal === null}>
            Añadir a la venta
          </button>
        </div>
      </form>
    </div>
  );
}
