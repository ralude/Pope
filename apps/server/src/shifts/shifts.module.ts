import { Global, Module } from '@nestjs/common';

import { OpenShiftGuard } from './open-shift.guard.js';
import { ShiftsController } from './shifts.controller.js';
import { ShiftsService } from './shifts.service.js';

/**
 * Turno de caja mínimo (T17). Es global porque recargas, combos y sesiones temporales usan
 * `@RequiresOpenShift()`, y su guard necesita `ShiftsService` en cada módulo.
 */
@Global()
@Module({
  controllers: [ShiftsController],
  providers: [ShiftsService, OpenShiftGuard],
  exports: [ShiftsService, OpenShiftGuard],
})
export class ShiftsModule {}
