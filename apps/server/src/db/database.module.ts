import {
  type DynamicModule,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from './database.js';

const DATABASE_HANDLE = Symbol('DATABASE_HANDLE');

/** Cierra la conexión cuando se detiene la aplicación. */
@Injectable()
class DatabaseCloser implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_HANDLE) private readonly handle: DatabaseHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle.close();
  }
}

/**
 * Expone la base de datos ya abierta (y migrada) a todo el servidor con el token
 * `DATABASE`. Quien arranca la aplicación decide cuál: PostgreSQL en `main.ts` o PGlite en
 * los tests.
 */
@Module({})
export class DatabaseModule {
  static forRoot(handle: DatabaseHandle): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [
        { provide: DATABASE_HANDLE, useValue: handle },
        { provide: DATABASE, useValue: handle.db },
        DatabaseCloser,
      ],
      exports: [DATABASE],
    };
  }
}
