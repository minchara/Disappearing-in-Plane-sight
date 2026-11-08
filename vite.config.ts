import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
const env = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env
const base = env?.GITHUB_PAGES === 'true' ? '/Disappearing-in-Plane-sight/' : './'
export default defineConfig({ base, plugins: [react()], server: { host: '0.0.0.0', port: 5173, proxy: { '/api': 'http://127.0.0.1:8000' } } })
