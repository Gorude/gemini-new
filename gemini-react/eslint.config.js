import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Ignora build, docs e scripts/experimentos descartáveis (não são código da app).
  globalIgnores(['dist', 'docs', 'scratch', 'run-replace.js']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // O projeto usa `any` deliberadamente para payloads dinâmicos de API
      // (Gemini/Firestore) e respostas de streaming. O tsc valida o resto.
      '@typescript-eslint/no-explicit-any': 'off',
      // Ignora variáveis/args prefixados com _ e erros de catch não usados.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      // Blocos catch vazios são intencionais em vários pontos (fallback silencioso).
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Regras avançadas do React Compiler (plugin v7): manter como aviso para não
      // bloquear com padrões pré-existentes que funcionam corretamente.
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
])
