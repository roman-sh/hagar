import { defineConfig } from 'vite'
import { stringPlugin } from 'vite-string-plugin'
import { globSync } from 'glob'
import nodeExternals from 'rollup-plugin-node-externals'

export default defineConfig({
   build: {
      ssr: true,
      target: 'node22',
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
         input: globSync('src/**/*.ts'),
         output: {
            preserveModules: true,
            preserveModulesRoot: 'src',
            entryFileNames: '[name].js',
         },
         preserveEntrySignatures: 'strict',
      },
   },
   plugins: [nodeExternals(), stringPlugin()],
}) 