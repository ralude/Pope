import { Module } from '@nestjs/common';

import { ProductPhotosService } from './product-photos.service.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

/** Productos del inventario, sus fotos y su stock (spec 005, REQ-005-01 a REQ-005-14). */
@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductPhotosService],
  exports: [ProductsService],
})
export class ProductsModule {}
