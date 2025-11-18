import tsParser from '@typescript-eslint/parser'

export default [
  {
    ignores: [
      'lib/**',
      'node_modules/**',
      'coverage/**'
    ],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json'],
        sourceType: 'module',
      },
    },
    rules: {
      semi: ['error', 'never'],
      quotes: ['error', 'single'],
      // Disable ESLint rules that TypeScript handles better
      'no-unused-vars': 'off', // TypeScript handles this via noUnusedLocals
      'no-undef': 'off', // TypeScript handles undefined variables
    },
  }
]