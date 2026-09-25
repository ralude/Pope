import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Valida el cuerpo de una petición con un esquema zod (AGENTS.md: toda entrada externa se
 * valida con zod). Uso: `@Body(new ZodValidationPipe(esquema)) body: Tipo`.
 */
export class ZodValidationPipe<Schema extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): z.infer<Schema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Datos no válidos',
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
