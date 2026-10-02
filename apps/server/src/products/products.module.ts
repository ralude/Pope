import { Module } from '@nestjs/common';

import { SettingsModule } from '../settings/settings.module.js';
import { ProductPhotosService } from './product-photos.service.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { StockService } from './stock.service.js';

/** Productos del inventario, sus fotos y su stock (spec 005, REQ-005-01 a REQ-005-14). */
@Module({
  controllers: [ProductsController],
  imports: [SettingsModule],
  providers: [ProductsService, ProductPhotosService, StockService],
  exports: [ProductsService, StockService],
})
export class ProductsModule {}
