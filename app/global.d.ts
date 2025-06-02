// Global declarations
import type { Logger } from 'pino'

declare global {
    // Tell TypeScript that 'log' exists on the global object
    var log: Logger
}

// Also declare it on globalThis for better compatibility
declare var log: Logger 