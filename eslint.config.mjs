import withNuxt from './.nuxt/eslint.config.mjs'
export default withNuxt(
  { ignores: ['prototype/**', 'test-results/**', 'playwright-report/**', '.output/**'] },
  { rules: { 'vue/multi-word-component-names': 'off', 'vue/html-self-closing': 'off' } },
  {
    files: ['app/lib/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['~/features/*', '~/stores/*', '~/server/*'] },
      ],
    },
  },
  {
    files: ['app/pages/**/*.vue', 'app/components/**/*.vue'],
    rules: { 'no-restricted-globals': ['error', 'fetch', '$fetch'] },
  },
)
