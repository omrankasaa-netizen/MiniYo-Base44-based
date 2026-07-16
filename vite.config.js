import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_TARGET = process.env.VITE_DEV_API_TARGET || 'http://localhost:4000'

// Vite injects the entry <script type="module"> before the generated
// <link rel="stylesheet"> in the built index.html. A stylesheet is
// render-blocking, so discovering it earlier (before the module script)
// lets the browser start the CSS fetch sooner and improves first paint.
// This plugin reorders the built <head> so stylesheet links precede the
// module script. It only rewrites the emitted HTML string — no runtime effect.
function cssBeforeModuleScript() {
  return {
    name: 'css-before-module-script',
    enforce: 'post',
    transformIndexHtml(html) {
      const scriptRe = /[ \t]*<script type="module"[^>]*><\/script>\n?/
      const scriptMatch = html.match(scriptRe)
      if (!scriptMatch) return html
      const styleRe = /[ \t]*<link rel="stylesheet"[^>]*>\n?/g
      const styles = html.match(styleRe)
      if (!styles) return html
      const withoutStyles = html.replace(styleRe, '')
      return withoutStyles.replace(scriptRe, styles.join('') + scriptMatch[0])
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [react(), cssBeforeModuleScript()],
  server: {
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/uploads': { target: API_TARGET, changeOrigin: true },
    },
  },
})
