/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Tests hit the API through MSW at this base URL (see src/test/server.ts).
    env: { VITE_API_BASE_URL: 'http://localhost:8000/api' },
    restoreMocks: true,
  },
})
