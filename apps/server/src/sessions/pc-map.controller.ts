import { Controller, Get } from '@nestjs/common';
import type { PcMap } from '@pope/shared';

import { PcMapService } from './pc-map.service.js';

/** PCs del local para el panel. El mapa lo consulta todo el personal (REQ-001-31). */
@Controller('pcs')
export class PcMapController {
  constructor(private readonly map: PcMapService) {}

  /** Todas las PCs con su conexión y su sesión activa. En vivo: el canal `/panel`. */
  @Get('map')
  snapshot(): Promise<PcMap> {
    return this.map.snapshot();
  }
}
