import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  StreamableFile,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  idSchema,
  PRODUCT_PHOTO_TYPE,
  type Product,
  type ProductCreateRequest,
  productCreateRequestSchema,
  type ProductUpdateRequest,
  productUpdateRequestSchema,
  type StaffProfile,
  type StockMovement,
  type StockMoveRequest,
  stockMoveRequestSchema,
} from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { staffActor } from '../auth/staff.controller.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ProductPhotosService } from './product-photos.service.js';
import { ProductsService } from './products.service.js';
import { StockService } from './stock.service.js';

/**
 * Productos del inventario. Todo el personal los ve con su stock; solo el administrador los
 * da de alta, edita o desactiva (REQ-005-04). No se borran.
 */
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly photos: ProductPhotosService,
    private readonly stock: StockService,
  ) {}

  @Get()
  list(): Promise<Product[]> {
    return this.products.list();
  }

  @Roles('administrador')
  @Post()
  create(
    @Body(new ZodValidationPipe(productCreateRequestSchema)) body: ProductCreateRequest,
    @CurrentStaff() admin: StaffProfile,
  ): Promise<Product> {
    return this.products.create(body, staffActor(admin));
  }

  @Roles('administrador')
  @Patch(':id')
  update(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(productUpdateRequestSchema)) body: ProductUpdateRequest,
    @CurrentStaff() admin: StaffProfile,
  ): Promise<Product> {
    return this.products.update(id, body, staffActor(admin));
  }

  /**
   * Sube la foto de un producto (REQ-005-03): cuerpo `image/webp` de 512 KB como mucho, ya
   * reducido por el panel. El tamaño y el tipo los comprueba el parser de `bootstrap.ts`.
   */
  @Roles('administrador')
  @Put(':id/photo')
  setPhoto(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body() body: unknown,
    @CurrentStaff() admin: StaffProfile,
  ): Promise<Product> {
    if (!Buffer.isBuffer(body)) {
      throw new UnsupportedMediaTypeException('La foto debe ser una imagen WebP');
    }
    return this.photos.set(id, body, staffActor(admin));
  }

  /** La foto de un producto. La ruta lleva su versión, así que no cambia: caché larga. */
  @Get(':id/photo')
  @Header('Cache-Control', 'private, max-age=31536000, immutable')
  async photo(@Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<StreamableFile> {
    return new StreamableFile(await this.photos.read(id), { type: PRODUCT_PHOTO_TYPE });
  }

  /**
   * Movimiento de stock (REQ-005-14): entradas, el encargado y el administrador; ajustes y
   * mermas, solo el administrador (lo comprueba el servicio).
   */
  @Roles('encargado', 'administrador')
  @Post(':id/stock')
  move(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(stockMoveRequestSchema)) body: StockMoveRequest,
    @CurrentStaff() member: StaffProfile,
  ): Promise<Product> {
    return this.stock.move(id, body, member);
  }

  /** Últimos movimientos de un producto, para su detalle en Inventario. */
  @Get(':id/movements')
  movements(@Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<StockMovement[]> {
    return this.stock.movements(id);
  }
}
