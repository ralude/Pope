// Inventario (spec 005, T18): productos con su foto, precio, stock y aviso de bajo mínimo, con
// un buscador por nombre. A la derecha, el producto elegido con sus últimos movimientos y las
// acciones de stock. Se refresca solo cuando el nodo avisa de que algo cambió (`cash`).
import '../inventory/inventory.css';

import {
  formatBolivares,
  formatMoney,
  type Product,
  productSchema,
  type StockMovement,
  stockMovementSchema,
} from '@pope/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ApiError, listOf } from '../api/client.js';
import {
  filterProducts,
  formatQuantity,
  movementDetail,
  movementLabel,
  productStatus,
  STATUS_LABEL,
} from '../inventory/model.js';
import { ProductDialog } from '../inventory/ProductDialog.js';
import { ProductPhoto } from '../inventory/ProductPhoto.js';
import { StockDialog, type StockKind } from '../inventory/StockDialog.js';
import { usePcMapFeed } from '../map/channel.js';
import { useSession, useStaff } from '../session.js';
import { Frame } from '../ui/Frame.js';

const productsSchema = listOf(productSchema);
const movementsSchema = listOf(stockMovementSchema);

function errorMessage(failure: unknown): string {
  return failure instanceof ApiError ? failure.message : String(failure);
}

export function InventoryPage() {
  const { api } = useSession();
  const staff = useStaff();
  const { rate, cashVersion } = usePcMapFeed();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stockKind, setStockKind] = useState<StockKind | null>(null);
  /** El producto que se edita, o 'new' para el alta. */
  const [editing, setEditing] = useState<Product | 'new' | null>(null);

  // Lista de productos: al entrar y cada vez que el nodo avisa de un cambio en el stock.
  useEffect(() => {
    let cancelled = false;
    api.get('/products', productsSchema).then(
      (list) => {
        if (cancelled) return;
        setProducts(list);
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

  const shown = useMemo(() => filterProducts(products ?? [], query), [products, query]);
  const selected =
    products?.find((p) => p.id === selectedId) ?? (selectedId === null ? shown[0] : undefined);
  const vesRate = rate?.rate?.vesPerUsd;

  const closeDialog = useCallback(() => {
    setStockKind(null);
    setEditing(null);
  }, []);

  const saved = (product: Product) => {
    setProducts((prev) => {
      const list = prev ?? [];
      return list.some((p) => p.id === product.id)
        ? list.map((p) => (p.id === product.id ? product : p))
        : [...list, product];
    });
    setSelectedId(product.id);
    setEditing(null);
  };

  return (
    <Frame
      title="Inventario"
      tabs={
        <input
          type="search"
          className="input inventory-search"
          placeholder="Buscar por nombre"
          aria-label="Buscar producto"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      }
      actions={
        staff.role === 'administrador' && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditing('new');
            }}
          >
            Nuevo producto
          </button>
        )
      }
    >
      <div className="inventory-layout">
        <div className="inventory-list">
          {loadError && (
            <div role="alert" className="alert-error">
              {loadError}
            </div>
          )}
          {products?.length === 0 && (
            <p className="detail-note" style={{ margin: 0 }}>
              Aún no hay productos.
            </p>
          )}
          {products && products.length > 0 && shown.length === 0 && (
            <p className="detail-note" style={{ margin: 0 }}>
              Ningún producto se llama así.
            </p>
          )}
          {shown.length > 0 && (
            <table className="inventory-table">
              <thead>
                <tr>
                  <th style={{ width: 52 }}>
                    <span className="sr-only">Foto</span>
                  </th>
                  <th>Producto</th>
                  <th className="num-cell">Precio</th>
                  <th className="num-cell">Stock</th>
                  <th className="num-cell">Mínimo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((product) => {
                  const status = productStatus(product);
                  return (
                    <tr
                      key={product.id}
                      aria-selected={product.id === selected?.id}
                      onClick={() => {
                        setSelectedId(product.id);
                      }}
                    >
                      <td>
                        <ProductPhoto product={product} size={36} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="inventory-name"
                          onClick={() => {
                            setSelectedId(product.id);
                          }}
                        >
                          {product.name}
                        </button>
                      </td>
                      <td className="num-cell num">
                        <div>{formatMoney(product.priceMicros)}</div>
                        {vesRate !== undefined && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            {formatBolivares(product.priceMicros, vesRate)}
                          </div>
                        )}
                      </td>
                      <td className="num-cell num inventory-stock">{product.stock}</td>
                      <td className="num-cell num muted">{product.minStock ?? '—'}</td>
                      <td>
                        <span className={`stock-pill stock-${status}`}>{STATUS_LABEL[status]}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <aside className="side-panel" aria-label="Producto seleccionado">
          {selected ? (
            <ProductDetail
              key={selected.id}
              product={selected}
              cashVersion={cashVersion}
              vesRate={vesRate}
              role={staff.role}
              onStock={setStockKind}
              onEdit={() => {
                setEditing(selected);
              }}
            />
          ) : (
            <p className="detail-note" style={{ margin: 0 }}>
              Elige un producto para ver su stock y sus movimientos.
            </p>
          )}
        </aside>
      </div>
      {editing && (
        <ProductDialog
          product={editing === 'new' ? null : editing}
          vesRate={vesRate}
          onClose={closeDialog}
          onDone={saved}
        />
      )}
      {selected && stockKind && (
        <StockDialog
          product={selected}
          kind={stockKind}
          onClose={closeDialog}
          onDone={(updated) => {
            setProducts((prev) => prev?.map((p) => (p.id === updated.id ? updated : p)) ?? null);
            setStockKind(null);
          }}
        />
      )}
    </Frame>
  );
}

function ProductDetail({
  product,
  cashVersion,
  vesRate,
  role,
  onStock,
  onEdit,
}: {
  product: Product;
  cashVersion: number;
  vesRate: Parameters<typeof formatBolivares>[1] | undefined;
  role: 'encargado' | 'administrador' | 'dueno';
  onStock: (kind: StockKind) => void;
  onEdit: () => void;
}) {
  const { api } = useSession();
  const [movements, setMovements] = useState<StockMovement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = role === 'administrador';

  // Los movimientos cambian con cada venta o movimiento: se piden de nuevo con `cash`.
  useEffect(() => {
    let cancelled = false;
    api.get(`/products/${product.id}/movements`, movementsSchema).then(
      (list) => {
        if (!cancelled) setMovements(list);
      },
      (failure: unknown) => {
        if (!cancelled) setError(errorMessage(failure));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, product.id, product.stock, cashVersion]);

  return (
    <>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <ProductPhoto product={product} size={72} />
        <div style={{ minWidth: 0 }}>
          <h2 className="detail-title" style={{ margin: 0 }}>
            {product.name}
          </h2>
          <span className="num" style={{ color: 'var(--soft)' }}>
            {formatMoney(product.priceMicros)}
            {vesRate !== undefined && ` · ${formatBolivares(product.priceMicros, vesRate)}`}
          </span>
        </div>
      </div>
      <div className="detail-grid">
        <div className="inventory-tile">
          <span className="detail-label">Stock</span>
          <span className="num" style={{ fontSize: 26 }}>
            {product.stock}
          </span>
        </div>
        <div className="inventory-tile">
          <span className="detail-label">Mínimo</span>
          <span className="num" style={{ fontSize: 26 }}>
            {product.minStock ?? '—'}
          </span>
        </div>
      </div>
      {product.active && product.lowStock && (
        <div className="notice-warn">Está en su mínimo o por debajo: conviene reponer.</div>
      )}
      {!product.active && <div className="detail-note">Desactivado: no aparece en la Caja.</div>}
      <span className="detail-label">Últimos movimientos</span>
      {error && (
        <div role="alert" className="alert-error">
          {error}
        </div>
      )}
      <div className="inventory-moves">
        {movements?.length === 0 && <span className="muted">Sin movimientos.</span>}
        {movements?.map((movement) => (
          <div key={movement.id} className="inventory-move">
            <span className={`num move-qty ${movement.quantity > 0 ? 'move-in' : 'move-out'}`}>
              {formatQuantity(movement.quantity)}
            </span>
            <div>
              <div style={{ fontWeight: 700 }}>{movementLabel(movement)}</div>
              <div className="muted">{movementDetail(movement)}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ flexGrow: 1 }} />
      {role !== 'dueno' && (
        <>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => {
              onStock('restock');
            }}
          >
            Entrada de mercancía
          </button>
          <div className="inventory-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!isAdmin}
              title={isAdmin ? undefined : 'Solo el administrador'}
              onClick={onEdit}
            >
              Editar
            </button>
            {(['adjustment', 'waste'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                className="btn btn-ghost"
                disabled={!isAdmin}
                title={isAdmin ? undefined : 'Solo el administrador'}
                onClick={() => {
                  onStock(kind);
                }}
              >
                {kind === 'adjustment' ? 'Ajuste' : 'Merma'}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
