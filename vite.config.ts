import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { apiDev } from './vite-plugin-api-dev.ts'

// https://vite.dev/config/
export default defineConfig({
  // apiDev() solo aplica en `vite dev` (apply: 'serve'): ejecuta las funciones
  // de api/ en local. En produccion las despliega Vercel.
  plugins: [react(), apiDev()],
})