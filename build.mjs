import { build } from 'esbuild'
import { readFileSync, rmSync } from 'fs'

// Read package.json to get dependencies
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'))
const external = Object.keys(packageJson.dependencies || {})

// Clean up the dist directory before building
try { rmSync('dist', { recursive: true }) } catch (e) { }

// Run esbuild
build({
   entryPoints: ['app/main.ts'],
   bundle: true,
   platform: 'node',
   format: 'esm',
   outfile: 'dist/bundle.js',
   external: external,
   loader: {
      '.md': 'text',
   },
}).catch(() => process.exit(1)) 
