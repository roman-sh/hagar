import { build } from 'esbuild'
import { readFileSync } from 'fs'

// Read package.json to get dependencies
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'))
const external = Object.keys(packageJson.dependencies || {})

// Run esbuild
build({
   entryPoints: ['app/main.ts'],
   bundle: true,
   platform: 'node',
   format: 'esm',
   outfile: 'dist/bundle.js',
   external: external,
}).catch(() => process.exit(1)) 