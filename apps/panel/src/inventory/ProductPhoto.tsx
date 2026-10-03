// Foto de un producto o, si no tiene, sus iniciales (REQ-005-03).
import { type Product, productPhotoPath } from '@pope/shared';

import { initials } from './model.js';

export function ProductPhoto({ product, size }: { product: Product; size: number }) {
  const path = productPhotoPath(product);
  return path ? (
    <img className="product-photo" src={path} alt="" width={size} height={size} />
  ) : (
    <div
      className="product-photo product-initials"
      style={{ width: size, height: size, fontSize: Math.round(size / 3) }}
      aria-hidden="true"
    >
      {initials(product.name)}
    </div>
  );
}
