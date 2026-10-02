import { Module } from '@nestjs/common';

import { SaleConceptsController } from './sale-concepts.controller.js';
import { SaleConceptsService } from './sale-concepts.service.js';

/** Ventas del mostrador y sus conceptos sin inventario (spec 005, REQ-005-05, REQ-005-20). */
@Module({
  controllers: [SaleConceptsController],
  providers: [SaleConceptsService],
  exports: [SaleConceptsService],
})
export class SalesModule {}
