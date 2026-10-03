import {
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  idSchema,
  localDateInCaracas,
  type ShiftEntriesResponse,
  type StaffProfile,
} from '@pope/shared';
import { z } from 'zod';

import { CurrentStaff } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ShiftsService } from '../shifts/shifts.service.js';
import { CashRegisterService } from './cash-register.service.js';
import { renderShiftReport } from './report-pdf.js';
import { ShiftReportService } from './shift-report.service.js';

/** Lo cobrado en la caja y los reportes del cierre (REQ-005-24, REQ-005-51 a REQ-005-53). */
@Controller('shifts')
export class CashController {
  constructor(
    private readonly register: CashRegisterService,
    private readonly shifts: ShiftsService,
    private readonly reports: ShiftReportService,
  ) {}

  /** Movimientos de la caja abierta, el más reciente arriba. Responde 409 si no hay caja. */
  @Get('current/entries')
  async current(): Promise<ShiftEntriesResponse> {
    const shift = await this.shifts.findOpen();
    if (!shift) {
      throw new ConflictException('No hay una caja abierta');
    }
    return this.register.list(shift.id);
  }

  /**
   * El PDF del cierre de una caja. El resumen de una página lo descargan quien la abrió o la
   * cerró, el administrador y el dueño (REQ-005-51); el detallado (`?full=1`), solo el
   * administrador y el dueño (REQ-005-53).
   */
  @Get(':id/report.pdf')
  async report(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    // `?full=1` pide el reporte detallado.
    @Query('full', new ZodValidationPipe(z.enum(['0', '1']).optional()))
    full: '0' | '1' | undefined,
    @CurrentStaff() member: StaffProfile,
  ): Promise<StreamableFile> {
    const detailed = full === '1';
    const report = await this.reports.report(id);
    if (member.role === 'encargado') {
      if (detailed) {
        throw new ForbiddenException('El reporte detallado es para el administrador y el dueño');
      }
      if (report.openedById !== member.id && report.closedById !== member.id) {
        throw new ForbiddenException('Solo puedes descargar el reporte de tus cierres de caja');
      }
    }
    const date = localDateInCaracas(new Date(report.summary.openedAt));
    const name = `cierre-caja${detailed ? '-detallado' : ''}-${date}.pdf`;
    return new StreamableFile(await renderShiftReport(report, detailed), {
      type: 'application/pdf',
      disposition: `attachment; filename="${name}"`,
    });
  }
}
