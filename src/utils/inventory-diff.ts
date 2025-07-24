import diff from 'deep-diff'
import { InventorySpreadsheet } from '../types/inventory'
import { Table } from 'console-table-printer'

export function createInventoryDiff(original: InventorySpreadsheet, corrected: InventorySpreadsheet): string {
   const differences = diff(original, corrected) || []

   // --- Step 1: Create a structured diff object (intermediate format) ---
   const structuredDiff: {
      meta: any | null
      modifiedRows: { row_number: string | number, changes: { field: string, before: any, after: any }[] }[]
   } = {
      meta: null,
      modifiedRows: [],
   }

   const metaChanges = differences.filter(d => d.path && d.path[0] === 'meta')
   if (metaChanges.length > 0) {
      structuredDiff.meta = { before: original.meta, after: corrected.meta }
   }

   const rowDifferences = differences.filter(
      d => d.path && d.path[0] === 'rows' && d.kind === 'E' && typeof d.path[1] === 'number'
   )

   const modifiedRowIndices = new Set<number>()
   rowDifferences.forEach(d => {
      modifiedRowIndices.add(d.path![1] as number)
   })

   // Convert the Set to an array and sort it numerically to ensure natural order
   const sortedIndices = Array.from(modifiedRowIndices).sort((a, b) => a - b)

   const rowNumIndex = original.header.indexOf('row_number')

   for (const index of sortedIndices) {
      const originalRow = original.rows[index]
      const correctedRow = corrected.rows[index]
      const rowNum = originalRow[rowNumIndex]

      const rowChanges: { field: string, before: any, after: any }[] = []
      for (let i = 0; i < original.header.length; i++) {
         const beforeVal = String(originalRow[i] ?? '')
         const afterVal = String(correctedRow[i] ?? '')

         if (beforeVal !== afterVal) {
            rowChanges.push({
               field: original.header[i],
               before: beforeVal,
               after: afterVal,
            })
         }
      }

      if (rowChanges.length > 0) {
         structuredDiff.modifiedRows.push({
            row_number: String(rowNum),
            changes: rowChanges,
         })
      }
   }

   // --- Step 2: Format the structured diff into a clean text table ---
   let output = `Meta Changes: ${structuredDiff.meta ? 'Yes' : 'None'}\n`
   output += '--------------------------------------------------\n'

   for (const modifiedRow of structuredDiff.modifiedRows) {
      output += `\nChanges for Row #${modifiedRow.row_number}\n`

      const sanitizedChanges = modifiedRow.changes.map((change: any) => ({
         ...change,
         before: String(change.before).replace(/\n/g, ' '),
         after: String(change.after).replace(/\n/g, ' '),
      }))

      const p = new Table({
         columns: [
            { name: 'field', alignment: 'left' },
            { name: 'before', alignment: 'left' },
            { name: 'after', alignment: 'left' },
         ],
         // This is the correct way to disable all styling and color
         shouldDisableColors: true,
      })
      p.addRows(sanitizedChanges)
      output += p.render()
   }

   return output
} 