import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  idSchema,
  type Product,
  type ProductCreateRequest,
  productCreateRequestSchema,
  type ProductUpdateRequest,
  productUpdateRequestSchema,
  type StaffProfile,
} from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { staffActor } from '../auth/staff.controller.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ProductsService } from './products.service.js';

/**
 * Productos del inventario. Todo el personal los ve con su stock; solo el administrador los
 * da de alta, edita o desactiva (REQ-005-04). No se borran.
 */
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

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
}
