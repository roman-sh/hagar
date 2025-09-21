/**
 * Matches a string representing a simple mathematical expression.
 * e.g., "2.00 * 10.5"
 * - Group 1: Captures the base number (the first number, including decimals).
 * - Group 2: Captures the operator (* or /).
 * - Group 3: Captures the factor (the second number, including decimals).
 */
export const EXPRESSION_REGEX = /^(\d+(?:\.\d+)?)\s*(\*|\/)\s*(\d+(?:\.\d+)?)$/

/**
 * Evaluates a quantity string, which may be a simple number or a mathematical expression.
 * If the string is an expression (e.g., "2.00 * 10"), it calculates the result.
 * If it's a simple number string (e.g., "20.00"), it parses it.
 *
 * @param quantity The quantity string to evaluate.
 * @returns The final calculated numeric value.
 * @throws An error if the expression is invalid or the number is malformed.
 */
export function evaluateExpression(quantity: string): string {
   const match = quantity.match(EXPRESSION_REGEX)

   if (match) {
      const base = +match[1]
      const operator = match[2]
      const factor = +match[3]

      if (isNaN(base) || isNaN(factor)) {
         throw new Error(`Invalid number in expression: "${quantity}"`)
      }

      if (operator === '*') {
         // weight to pieces conversion
         const result = base * factor
         return result.toFixed(2)
      }
      if (operator === '/') {
         const result = base / factor
         // pieces to weight conversion (redundant?)
         return result.toFixed(2)
      }
   }

   // If it's not an expression, just pass it through.
   if (isNaN(+quantity)) {
      throw new Error(`Invalid quantity format: "${quantity}"`)
   }
   return quantity
}
