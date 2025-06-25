import { build } from 'esbuild'
import { readFileSync, rmSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Read package.json to get dependencies
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'))
const packageLockJson = JSON.parse(readFileSync('./package-lock.json', 'utf8'))

// Get all dependencies from package-lock.json
const external = Object.keys(packageLockJson.packages)
   .filter(key => key.startsWith('node_modules/'))
   .map(key => key.replace('node_modules/', ''))

const nativeNodeModulesPlugin = {
   name: 'native-node-modules',
   setup(build) {
      // If a ".node" file is imported within a module in node_modules, resolve
      // it to an absolute path and mark it as external.
      build.onResolve({ filter: /\.node$/, namespace: 'file' }, args => {
         if (args.resolveDir.includes('node_modules')) {
            return {
               path: require.resolve(args.path, { paths: [args.resolveDir] }),
               external: true,
            }
         }
      })
   },
}

// Clean up the dist directory before building
try {
   rmSync('dist', { recursive: true })
} catch (e) {}

// Run esbuild
build({
   entryPoints: ['app/main.ts'],
   bundle: true,
   platform: 'node',
   format: 'esm',
   outfile: 'dist/bundle.js',
   external,
   loader: {
      '.md': 'text',
   },
   plugins: [nativeNodeModulesPlugin],
}).catch(() => process.exit(1)) 
