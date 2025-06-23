import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    {
      name: 'markdown-loader',
      transform(code, id) {
        if (id.slice(-3) === '.md') {
          // For .md files, return the raw content as a string
          return `export default ${JSON.stringify(code)};`
        }
      },
    },
  ],
  test: {
    // We no longer need alias, the plugin will handle it.
    environment: 'node',
    // Increase the timeout to 30 seconds to allow for slow Puppeteer operations
    testTimeout: 30000,
  },
}) 