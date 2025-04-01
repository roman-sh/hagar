// Global declarations
import type { Logger } from 'pino'

declare global {
    // Tell TypeScript that 'log' exists on the global object
    var log: Logger
} 