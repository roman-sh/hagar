/**
 * Suppress specific NodeJS deprecation warnings to reduce noise in logs
 */

// @ts-nocheck - Disabling TypeScript for this file
// Suppress punycode deprecation warning
const originalEmit = process.emit
process.emit = function (name, data, ...args) {
   if (
      name === 'warning' &&
      data.name === 'DeprecationWarning' &&
      data.code === 'DEP0040'
   ) {
      return false
   }
   return originalEmit.apply(process, [name, data, ...args])
}
