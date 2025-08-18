import { PassArgs, ProductCandidate, InventoryItem } from '../../types/inventory'
import { openai } from '../../connections/openai'
import { H } from '../../config/constants'
import resolveCandidatesPrompt from '../../prompts/resolve-candidates.md'
import { AUX_MODEL } from '../../config/settings'
import { database } from '../db'
import { QueueKey } from '../../queues-base'


/**
 * Resolves ambiguous inventory items using an AI model.
 * This pass processes any unresolved items that have a list of potential candidates,
 * de-duplicates the candidates, and uses an LLM to choose the best match.
 */
export const aiPass = async (
   { doc, docId, queue }: PassArgs
): Promise<void> => {
   
   const itemsToProcess = doc.items.filter(item =>
      !item[H.INVENTORY_ITEM_ID]    // not resolved yet
      && !!item.candidates?.length  // has candidates
   )

   // --- Pre-process: De-duplicate candidates ---
   itemsToProcess.forEach(deduplicateCandidates)

   if (!itemsToProcess.length) {
      log.info({ docId }, 'aiPass: No ambiguous items to process.')
      return
   }

   // --- AI Resolution Pipeline ---
   const itemsForAi = prepareAiPayload(itemsToProcess)
   
   await database.saveArtefact({ docId, queue, key: 'ai-pass-input', data: itemsForAi })
   log.info(
      { docId },
      `aiPass: Found ${itemsToProcess.length} ambiguous items, preparing for AI resolution.`
   )

   const resolutions = await callAiForResolutions(itemsForAi)
   await applyAiResolutions({ resolutions, itemsToProcess, docId, queue })

   // Clean up candidates from all processed items.
   itemsToProcess.forEach(item => delete item.candidates)
}


// -------- Helper Functions --------

/**
 * De-duplicates the candidates for a single inventory item in place.
 */
function deduplicateCandidates(item: InventoryItem): void {
   if (!item.candidates) return
   const uniqueCandidates = new Map<string, ProductCandidate>()
   item.candidates.forEach(candidate => {
      uniqueCandidates.set(candidate._id, candidate)
   })
   item.candidates = Array.from(uniqueCandidates.values())
}

/**
 * Prepares the JSON payload for the AI by enhancing names and creating database `_id` keys.
 */
function prepareAiPayload(items: InventoryItem[]) {
   return items.map(item => {
      // Enhance the item name with its unit for better matching context.
      const itemName = item[H.SUPPLIER_ITEM_NAME]
      const itemUnit = item[H.SUPPLIER_ITEM_UNIT]
      // Format the unit in parentheses for clear, human-readable display.
      const itemNameForAi = itemUnit ? `${itemName} (${itemUnit})` : itemName
      
      // Create a candidate list where the key is the product's actual database _id.
      // e.g., { "product:organi_ein_karem:12345": "Organic Milk 1L (Bottle)" }
      const candidates = item.candidates.map(candidate => {
         const candidateNameForAi = !!candidate.unit
            ? `${candidate.name} (${candidate.unit})`
            : candidate.name
         return { [candidate._id]: candidateNameForAi }
      })
      // The final structure for a single item sent to the AI.
      // e.g., { "Milk 1L (Carton)": [ { "prod_1": "Milk" }, { "prod_2": "Oat Milk" } ] }
      return { [itemNameForAi]: candidates }
   })
}

/**
 * Calls the OpenAI API with the prepared payload and returns the parsed resolutions.
 * The JSON structure sent to the AI, and response format, are defined by the prompt.
 * @see {@link ../../prompts/resolve-candidates.md} for expected data structures.
 */
async function callAiForResolutions(itemsForAi: any[]) {
   const prompt = resolveCandidatesPrompt.replace(
      '{{ITEMS_TO_RESOLVE}}',
      JSON.stringify(itemsForAi, null, 2)
   )
   const response = await openai.chat.completions.create({
      model: AUX_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
   })
   const content = response.choices[0].message.content
   const { result } = JSON.parse(content) as { result: Record<string, string | null>[] }
   return result
}

interface ApplyResolutionsArgs {
   resolutions: Record<string, string | null>[]
   itemsToProcess: InventoryItem[]
   docId: string
   queue: QueueKey
}

/**
 * Applies the AI's resolutions to the original inventory document items.
 */
async function applyAiResolutions({ resolutions, itemsToProcess, docId, queue }: ApplyResolutionsArgs) {
   for (const resolution of resolutions) {
      // The AI returns an array of objects, where each object maps an item's original
      // zero-based index (as a string key) to the chosen candidate's _id.
      // e.g., { "0": "product:organi_ein_karem:12345" }
      // This line efficiently unpacks that object into its key and value.
      const [itemIndexStr, chosenId] = Object.entries(resolution)[0]
      const itemToUpdate = itemsToProcess[+itemIndexStr]

      // This is a safeguard against an out-of-bounds index from the AI.
      if (!itemToUpdate) {
         log.error({ docId, itemIndexStr, resolution }, 'AI returned an index that is out of bounds.')
         continue
      }
      
      // If the AI returns null, it means it was not confident in any match.
      if (!chosenId) {
         const candidateNames = itemToUpdate.candidates?.map(c => c.name).join(' | ') || 'No candidates'
         log.info({
            docId,
            supplierName: itemToUpdate[H.SUPPLIER_ITEM_NAME],
            candidates: candidateNames,
         }, 'aiPass: AI could not resolve a confident match for this item.')
         continue
      }

      // Find the chosen candidate object from the original list using the _id returned by the AI.
      const chosenCandidate = itemToUpdate.candidates!.find(c => c._id === chosenId)

      // This is a safeguard. If the AI hallucinates or returns an _id that wasn't in the
      // original candidate list, we log a warning and skip the update to prevent errors.
      if (!chosenCandidate) {
         log.warn({ docId, chosenId, item: itemToUpdate[H.SUPPLIER_ITEM_NAME] }, 'AI returned an invalid _id. Skipping resolution.')
         continue
      }
      
      // Mutate the original document item with the AI's choice.
      itemToUpdate[H.INVENTORY_ITEM_ID] = chosenCandidate._id
      itemToUpdate[H.INVENTORY_ITEM_NAME] = chosenCandidate.name
      itemToUpdate[H.INVENTORY_ITEM_UNIT] = chosenCandidate.unit
      itemToUpdate[H.MATCH_TYPE] = 'name'
   }

   await database.saveArtefact({
      docId,
      queue,
      key: 'ai-pass-output',
      data: itemsToProcess,
   })
}