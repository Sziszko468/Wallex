/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { buildContentSecurityPolicy } from './src/security/csp.ts'

const DEFAULT_API_BASE_URL = 'http://localhost:8000/api'

/** Adds the CSP <meta> tag to the production build only (dev needs inline scripts for HMR). */
function contentSecurityPolicy(apiBaseUrl: string): Plugin {
  return {
    name: 'spendly-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: buildContentSecurityPolicy(apiBaseUrl) },
        injectTo: 'head-prepend',
      },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  return {
    plugins: [react(), contentSecurityPolicy(env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL)],
    build: {
      // Small files are normally inlined as data: URIs, which the production CSP (font-src 'self')
      // blocks. Fonts are always emitted as real files instead.
      assetsInlineLimit: (filePath: string) => (filePath.endsWith(".woff2") ? false : undefined),
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // Tests hit the API through MSW at this base URL (see src/test/server.ts).
      env: { VITE_API_BASE_URL: DEFAULT_API_BASE_URL },
      restoreMocks: true,
    },
  }
})
