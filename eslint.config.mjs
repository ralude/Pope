// Configuración de ESLint compartida por todo el monorepo (configuración plana).
// ESLint busca este archivo subiendo desde cada archivo analizado, así que los paquetes
// no necesitan su propia configuración salvo que añadan reglas (p. ej. React).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/dist/', '**/build/', '**/coverage/', '**/.turbo/']),

  js.configs.recommended,

  // Reglas estrictas que usan la información de tipos de TypeScript.
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Cada archivo usa el tsconfig.json más cercano de su paquete.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Los archivos JavaScript (configuraciones) no tienen tipos que comprobar.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Desactiva las reglas de estilo que ya resuelve Prettier. Debe ir al final.
  prettier,
);
