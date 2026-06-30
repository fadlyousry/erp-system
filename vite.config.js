import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import JavaScriptObfuscator from 'javascript-obfuscator'

const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  numbersToExpressions: true,
  simplify: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  splitStrings: true,
  splitStringsChunkLength: 10,
  unicodeEscapeSequence: false,
  identifierNamesGenerator: 'mangled',
}

const obfuscateAppChunks = () => ({
  name: 'obfuscate-app-chunks',
  apply: 'build',
  renderChunk(code, chunk) {
    if (!chunk.fileName.endsWith('.js')) {
      return null
    }

    if (chunk.fileName.includes('xlsx')) {
      return null
    }

    const obfuscationResult = JavaScriptObfuscator.obfuscate(code, obfuscatorOptions)
    return {
      code: obfuscationResult.getObfuscatedCode(),
      map: null
    }
  }
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // obfuscateAppChunks()
  ],
  base: './', // Important for Electron to find assets
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/xlsx')) {
            return 'xlsx'
          }
          return undefined
        }
      }
    }
  }
})
