// Caja (spec 005, REQ-005-20): como en SENET, el catálogo a la izquierda (golosinas con su foto
// y el otro ingreso, con su importe y su comentario) y la venta nueva al lado, con su total en USD y Bs. El
// cobro va debajo del total (T20b) y los movimientos del turno, a la derecha (T21).
import '../caja/caja.css';

import {
  formatBolivares,
  formatLocalTime,
  formatMoney,
  MAX_OTHER_COMMENT_LENGTH,
  type Micros,
  type Product,
  productPhotoPath,
  productSchema,
  settingsSchema,
  type VesRate,
} from '@pope/shared';
import { useEffect, useState } from 'react';

import { ApiError, listOf } from '../api/client.js';
import {
  addOther,
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
import { parseUsd } from '../ui/money.js';

const productsSchema = listOf(productSchema);

function errorMessage(failure: unknown): string {
  return failure instanceof ApiError ? failure.message : String(failure);
}

export function CajaPage() {
  const { api } = useSession();
  const { canCharge, shift, startOpen, startClose } = useShift();
  const staff = useStaff();
  const { rate, cashVersion } = usePcMapFeed();
  const vesRate = rate?.rate?.vesPerUsd;
  const [products, setProducts] = useState<Product[]>([]);
  const [allowNegative, setAllowNegative] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<'snacks' | 'other'>('snacks');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [lastSale, setLastSale] = useState<string | null>(null);

  // El catálogo, al entrar y con cada cambio de stock o de precios (`cash`).
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get('/products', productsSchema), api.get('/settings', settingsSchema)]).then(
      ([productList, settings]) => {
        if (cancelled) return;
        setProducts(productList.filter((p) => p.active));
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
        shift !== undefined &&
        (shift === null ? (
          <button type="button" className="btn btn-primary" onClick={startOpen}>
            Abrir caja
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={startClose}>
            Cerrar caja
          </button>
        ))
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
            <OtherIncome
              vesRate={vesRate}
              onAdd={(amount, comment) => {
                setCart((prev) => addOther(prev, amount, comment));
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
                // Dos otros ingresos pueden ser iguales: se distinguen por su posición.
                key={line.kind === 'product' ? line.productId : `other-${String(index)}`}
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

/**
 * El otro ingreso del diseño (REQ-005-05): lo que no es golosina ni horas de PC, con el
 * importe en USD (y su Bs) y un comentario opcional.
 */
function OtherIncome({
  vesRate,
  onAdd,
}: {
  vesRate: VesRate | undefined;
  onAdd: (amount: Micros, comment: string) => void;
}) {
  const [amountText, setAmountText] = useState('');
  const [comment, setComment] = useState('');
  const amount = parseUsd(amountText);
  const valid = amount !== null && amount > 0;
  return (
    <form
      className="card caja-other"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onAdd(amount, comment);
        setAmountText('');
        setComment('');
      }}
    >
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Otro ingreso</div>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.4 }}>
          Lo que no es golosina ni horas de PC: impresiones, copias, plastificado…
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="otro-importe">
          Introduce la suma (USD)
        </label>
        <input
          id="otro-importe"
          className="input num caja-other-amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={amountText}
          onChange={(event) => {
            setAmountText(event.target.value);
          }}
        />
        <div className="muted num" style={{ fontSize: 12, textAlign: 'center' }}>
          {valid && vesRate !== undefined
            ? `≈ ${formatBolivares(amount, vesRate)}`
            : 'Se cobra después con cualquier método, también en Bs'}
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="otro-comentario">
          Comentario (opcional)
        </label>
        <input
          id="otro-comentario"
          className="input"
          autoComplete="off"
          placeholder="p. ej. 12 impresiones a color"
          maxLength={MAX_OTHER_COMMENT_LENGTH}
          value={comment}
          onChange={(event) => {
            setComment(event.target.value);
          }}
        />
      </div>
      <button type="submit" className="btn btn-primary caja-other-add" disabled={!valid}>
        Añadir a la venta
      </button>
    </form>
  );
}
