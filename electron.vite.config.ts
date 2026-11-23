import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          // The built-in brain (llama.cpp) runs in its own process.
          llamaHost: resolve('src/main/brain/llamaHost.ts')
        }
      }
    }
  },
  preload: {},
  renderer: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          settings: resolve('src/renderer/settings.html'),
          welcome: resolve('src/renderer/welcome.html'),
          games: resolve('src/renderer/games.html')
        }
      }
    }
  }
})
