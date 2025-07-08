/**
 * Checks if a given variable is a plain object, and not an array or null.
 * @param {any} value The value to check.
 * @returns {boolean} True if the value is a plain object, false otherwise.
 */
export function isObject(value: any): value is Record<string, any> {
   return typeof value === 'object' && value !== null && !Array.isArray(value)
}
