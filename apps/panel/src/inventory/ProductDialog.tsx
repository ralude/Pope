// Alta y edición de un producto (REQ-005-01, REQ-005-03, REQ-005-04), solo para el
// administrador, como el modal "Nuevo producto" del diseño. Lo que llegó al dar de alta se
// guarda como su primera entrada: el stock nunca se escribe (REQ-005-10). La foto se reduce en
// el navegador y se sube después de guardar el producto.
import { formatBolivares, type Product, productSchema, type VesRate } from '@pope/shared';
import { type SyntheticEvent, useEffect, useRef, useState } from 'react';

import { ApiError } from '../api/client.js';
import { useSession } from '../session.js';
import { Dialog } from '../ui/Dialog.js';
import { formatUsdInput, parseUsd } from '../ui/money.js';
import { parseCount } from './model.js';
import { PHOTO_ACCEPT, PhotoError, shrinkPhoto } from './photo.js';
import { ProductPhoto } from './ProductPhoto.js';

function errorMessage(failure: unknown): string {
  return failure instanceof ApiError || failure instanceof PhotoError
    ? failure.message
    : String(failure);
}

export function ProductDialog({
  product: initial,
  vesRate,
  onClose,
  onDone,
}: {
  /** `null` para dar de alta uno nuevo. */
  product: Product | null;
  vesRate: VesRate | undefined;
  onClose: () => void;
  onDone: (product: Product) => void;
}) {
  const { api } = useSession();
  // El producto ya guardado: tras el alta, si la foto falla, el siguiente intento la sube sola.
  const [product, setProduct] = useState(initial);
  const [name, setName] = useState(initial?.name ?? '');
  const [priceText, setPriceText] = useState(initial ? formatUsdInput(initial.priceMicros) : '');
  const [minText, setMinText] = useState(
    initial?.minStock === null || initial === null ? '' : String(initial.minStock),
  );
  const [arrivedText, setArrivedText] = useState('');
  const [active, setActive] = useState(initial?.active ?? true);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // La vista previa es una URL del navegador: se libera al cambiar de foto o al cerrar.
  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [photo]);

  const trimmed = name.trim();
  const price = parseUsd(priceText);
  const minStock = parseCount(minText);
  const arrived = parseCount(arrivedText);
  const valid =
    trimmed !== '' &&
    price !== null &&
    minStock !== undefined &&
    (product !== null || arrived !== undefined);

  const choosePhoto = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    shrinkPhoto(file).then(setPhoto, (failure: unknown) => {
      setError(errorMessage(failure));
    });
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!valid || arrived === undefined) return;
    setBusy(true);
    setError(null);
    const data = { name: trimmed, priceMicros: price, minStock, active };
    const save = product
      ? api.patch(`/products/${product.id}`, data, productSchema)
      : api.post('/products', { ...data, initialQuantity: arrived ?? 0 }, productSchema);
    save
      .then(async (saved) => {
        setProduct(saved);
        if (!photo) return saved;
        try {
          return await api.upload(`/products/${saved.id}/photo`, photo, productSchema);
        } catch (failure) {
          throw new PhotoError(
            `El producto se guardó, pero la foto no: ${errorMessage(failure)} Vuelve a guardar para reintentarlo.`,
          );
        }
      })
      .then(onDone, (failure: unknown) => {
        setBusy(false);
        setError(errorMessage(failure));
      });
  };

  return (
    <Dialog
      title={product ? `Editar ${product.name}` : 'Nuevo producto'}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="product-form">
        <div className="product-photo-field">
          <button
            type="button"
            className="product-photo-pick"
            onClick={() => {
              fileInput.current?.click();
            }}
          >
            {preview ? (
              <img src={preview} alt="Foto elegida" width={150} height={150} />
            ) : product?.photoVersion ? (
              <ProductPhoto product={product} size={150} />
            ) : (
              <span>Subir foto</span>
            )}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={PHOTO_ACCEPT}
            className="sr-only"
            aria-label="Foto del producto"
            onChange={(event) => {
              choosePhoto(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <span className="field-hint">JPG, PNG o WebP. Se reduce sola antes de subirla.</span>
        </div>
        <div className="product-fields">
          <div className="field">
            <label className="label" htmlFor="producto-nombre">
              Nombre
            </label>
            <input
              id="producto-nombre"
              className="input"
              autoComplete="off"
              autoFocus
              maxLength={100}
              placeholder="Doritos 45 g"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </div>
          <div className="detail-grid">
            <div className="field">
              <label className="label" htmlFor="producto-precio">
                Precio de venta (USD)
              </label>
              <input
                id="producto-precio"
                className="input num"
                inputMode="decimal"
                autoComplete="off"
                placeholder="1,50"
                value={priceText}
                aria-invalid={priceText !== '' && price === null}
                onChange={(event) => {
                  setPriceText(event.target.value);
                }}
              />
              {price !== null && vesRate !== undefined && (
                <span className="field-hint">{formatBolivares(price, vesRate)}</span>
              )}
            </div>
            <div className="field">
              <label className="label" htmlFor="producto-minimo">
                Stock mínimo (opcional)
              </label>
              <input
                id="producto-minimo"
                className="input num"
                inputMode="numeric"
                autoComplete="off"
                value={minText}
                aria-invalid={minStock === undefined}
                onChange={(event) => {
                  setMinText(event.target.value);
                }}
              />
              <span className="field-hint">Avisa al llegar a esta cantidad.</span>
            </div>
          </div>
          {!product && (
            <div className="field">
              <label className="label" htmlFor="producto-llego">
                Cantidad que llegó
              </label>
              <input
                id="producto-llego"
                className="input num"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                value={arrivedText}
                aria-invalid={arrived === undefined}
                onChange={(event) => {
                  setArrivedText(event.target.value);
                }}
              />
              <span className="field-hint">
                Se guarda como la primera entrada de mercancía. Después, para sumar más, usa
                «Entrada».
              </span>
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => {
                setActive(event.target.checked);
              }}
            />
            Activo: se puede vender
          </label>
        </div>
      </div>
      {error && (
        <div role="alert" className="alert-error">
          {error}
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !valid}>
          {busy ? 'Guardando…' : 'Guardar producto'}
        </button>
      </div>
    </Dialog>
  );
}
