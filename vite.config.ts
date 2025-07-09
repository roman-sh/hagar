import { defineConfig } from 'vite'
import { stringPlugin } from 'vite-string-plugin'
import nodeExternals from 'rollup-plugin-node-externals'

export default defineConfig({
   build: {
      ssr: true,
      target: 'node22',
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
         input: 'src/main.ts',
      },
   },
   plugins: [nodeExternals(), stringPlugin()],
}) 