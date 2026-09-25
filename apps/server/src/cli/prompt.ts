// Preguntas por consola para la CLI. La contraseña se escribe sin que se vea en pantalla.
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

/** Salida que se puede silenciar: así el eco de la contraseña no llega a la pantalla. */
class MutableOutput extends Writable {
  muted = false;

  override _write(chunk: Buffer, _encoding: BufferEncoding, done: () => void): void {
    if (!this.muted) {
      process.stdout.write(chunk);
    }
    done();
  }
}

export interface Prompter {
  /** Pregunta un texto visible. */
  ask(question: string): Promise<string>;
  /** Pregunta un texto sin mostrarlo (contraseñas). */
  askHidden(question: string): Promise<string>;
  close(): void;
}

/**
 * Crea un único lector de líneas para toda la sesión. Las líneas se leen con un iterador
 * creado desde el principio, que las guarda hasta que se piden: así funciona igual en una
 * terminal que con la entrada redirigida, aunque esta termine antes de la primera pregunta.
 */
export function createPrompter(): Prompter {
  const output = new MutableOutput();
  const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY });
  const lines = rl[Symbol.asyncIterator]();

  async function nextLine(): Promise<string> {
    const line = await lines.next();
    if (line.done === true) {
      throw new Error('Se terminó la entrada antes de responder todas las preguntas.');
    }
    return line.value;
  }

  return {
    ask(question) {
      process.stdout.write(question);
      return nextLine();
    },
    async askHidden(question) {
      process.stdout.write(question);
      output.muted = true;
      try {
        return await nextLine();
      } finally {
        output.muted = false;
        if (process.stdin.isTTY) {
          process.stdout.write('\n');
        }
      }
    },
    close: () => {
      rl.close();
    },
  };
}
