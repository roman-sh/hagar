import { InventoryDocument, PassArgs } from '../../types/inventory'
import { openai } from '../../connections/openai'
import { H, INVENTORY_UPDATE } from '../../config/constants'
import resolveCandidatesPrompt from '../../prompts/resolve-candidates.md'
import { AUX_MODEL } from '../../config/settings'
import { database } from '../db'

/**
 * Resolves ambiguous inventory items using an AI model.
 *
 * This pass is designed to run after other passes (like barcode or vector search)
 * have generated a list of potential product matches (`candidates`) for an invoice item.
 * If an item has more than one candidate, this pass will ask an LLM to choose the best one.
 *
 * --- Core Strategy ---
 * 1.  **Contextual Naming**: To improve accuracy, it enhances the names of both the
 *     invoice item and the candidate products with their unit information (e.g., "[kg]", "[unit]"), if available.
 * 2.  **Positional Aliases**: Instead of sending real product IDs to the AI, it generates
 *     stateless, temporary aliases in the format `p_{itemIndex}_{candidateIndex}`. This
 *     avoids extra lookup maps and makes parsing the AI's response trivial and robust.
 * 3.  **JSON Output**: It requests a JSON object from the AI without enforcing a
 *     strict schema, relying on prompt instructions for the structure.
 * 
 * Note: see {@link ../../prompts/resolve-candidates.md} for example data structures
 *
 * @param doc The inventory document to process. This object is mutated directly by the function.
 * @param storeId The ID of the store (unused in this pass but maintained for a consistent function signature across all passes).
 * @param docId The master document/job ID for consistent logging.
 */
export const aiPass = async (
   { doc, storeId, docId, passName }: PassArgs
): Promise<void> => {

   // Filter for items that are unresolved and have multiple candidates.
   const ambiguousItems = doc.items.filter(
      item =>
         !item[H.INVENTORY_ITEM_ID] &&
         item.candidates?.length > 1
   )

   if (!ambiguousItems.length) {
      log.info(
         { docId },
         'aiPass: No ambiguous items to process.'
      )
      return
   }

   // Prepare the data payload for the AI, transforming items and creating positional aliases.
   const ALIAS_TEMPLATE = 'p_{{itemIndex}}_{{candidateIndex}}'
   const itemsForAi = ambiguousItems.map((item, itemIndex) => {
      // Enhance the item name with its unit for better matching context.
      const itemName = item[H.SUPPLIER_ITEM_NAME]
      const itemUnit = item[H.UNIT]
      // Format the unit in parentheses for clear, human-readable display.
      const itemNameForAi = itemUnit ? `${itemName} (${itemUnit})` : itemName

      // Create a candidate list where each has a unique, temporary, and stateless alias.
      // e.g., 'p_5_1' refers to the 2nd candidate of the 6th ambiguous item.
      const candidates = item.candidates.map((candidate, candidateIndex) => {
         const alias = ALIAS_TEMPLATE
            .replace('{{itemIndex}}', String(itemIndex))
            .replace('{{candidateIndex}}', String(candidateIndex))
         
         const candidateNameForAi = candidate.unit ? `${candidate.name} (${candidate.unit})` : candidate.name
         return { [alias]: candidateNameForAi }
      })
      return { [itemNameForAi]: candidates }
   })

   // Save the input payload as a job artefact before calling the AI.
   await database.saveArtefact({
      docId,
      storeId,
      queue: INVENTORY_UPDATE,
      key: `${passName}-ai-pass-input`,
      data: itemsForAi,
   })

   log.info(
      { docId, count: ambiguousItems.length },
      `${passName} aiPass: Found ambiguous items, preparing for AI resolution.`
   )

   // Inject the JSON data into the main prompt template.
   const prompt = resolveCandidatesPrompt.replace(
      '{{ITEMS_TO_RESOLVE}}',
      JSON.stringify(itemsForAi, null, 2)
   )

   const response = await openai.chat.completions.create({
      model: AUX_MODEL,
      messages: [{ role: 'user', content: prompt }],
      // Request a JSON object, but without a strict schema.
      response_format: { type: 'json_object' }
   })

   const content = response.choices[0].message.content

   log.info({ docId, rawResponse: content }, 'aiPass: Raw AI response received.')

   // Parse the AI's response and apply the resolutions.
   const { result: resolutions } =
      JSON.parse(content) as { result: Record<string, string | null>[] }

   log.info(
      { docId, count: resolutions.length },
      'aiPass: Received resolutions from AI.'
   )

   for (const resolution of resolutions) {
      // Each `resolution` object is like `{ '0': 'p_0_1' }`.
      const [itemIndexStr, chosenAlias] = Object.entries(resolution)[0]
      if (!chosenAlias) continue // AI decided there was no good match.

      // Reconstruct the original indices from the positional alias string.
      const [, , candidateIndexStr] = chosenAlias.split('_')

      const itemToUpdate = ambiguousItems[+itemIndexStr]
      const chosenCandidate = itemToUpdate.candidates?.[+candidateIndexStr]

      // Mutate the original document item with the AI's choice.
      itemToUpdate[H.INVENTORY_ITEM_ID] = chosenCandidate.productId
      itemToUpdate[H.INVENTORY_ITEM_NAME] = chosenCandidate.name
      itemToUpdate[H.MATCH_TYPE] = passName 
      // Clean up the candidates array
      delete itemToUpdate.candidates

      log.info(
         {
            docId,
            productId: chosenCandidate.productId,
            supplierName: itemToUpdate[H.SUPPLIER_ITEM_NAME],
            inventoryName: chosenCandidate.name,
         },
         `${passName} aiPass: Resolved item.`
      )

   }

   // Save the output payload as a job artefact after processing.
   // The 'ambiguousItems' array now contains the final state of all items
   // that were considered by this pass, including those that were resolved.
   await database.saveArtefact({
      docId,
      storeId,
      queue: INVENTORY_UPDATE,
      key: `${passName}-ai-pass-output`,
      data: ambiguousItems,
   })
}