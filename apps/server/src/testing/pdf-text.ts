// Lee el texto de los PDF que genera el nodo (sin comprimir, fuentes estándar): cada trozo de
// texto va en hexadecimal, en la codificación WinAnsi, dentro de un operador `TJ`.

const WIN_ANSI = new TextDecoder('windows-1252');

/** Los textos del PDF, uno por cada vez que se escribió (una celda, una línea). */
export function pdfTexts(pdf: Buffer): string[] {
  const source = pdf.toString('latin1');
  return [...source.matchAll(/\[(.*?)\] TJ/g)].map((match) =>
    [...(match[1] ?? '').matchAll(/<([0-9a-f]*)>/g)]
      .map((hex) => WIN_ANSI.decode(Buffer.from(hex[1] ?? '', 'hex')))
      .join(''),
  );
}

/** Número de páginas del PDF. */
export function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
}
