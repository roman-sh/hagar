import basePrompt from '../prompts/base.md'
import { database } from './db'

// Dynamic import of stage prompts
// keys are like: "../prompts/stages/scan_validation/instructions.md"
const instructionModules = import.meta.glob('../prompts/stages/*/instructions.md', {
   query: '?raw',
   import: 'default',
   eager: true // Load them synchronously for simplicity (they are just strings)
})

const descriptionModules = import.meta.glob('../prompts/stages/*/description.md', {
   query: '?raw',
   import: 'default',
   eager: true
})


export const prompts = {
   /**
    * Composes the full system message for the AI based on the current context.
    * It fetches the store's pipeline and dynamically builds the prompt.
    * @param queueName - The current active queue (stage).
    * @param docId - The document ID for context-specific data.
    * @param phone - The user's phone for notifications and general context.
    */
   async composeSystemMessage(
      queueName: string | undefined,
      phone: string
   ): Promise<string> {
      // 1. Fetch the pipeline for the current context using the phone number.
      const storeId = await database.getStoreIdByPhone(phone)
      const { pipeline } = await database.getStore(storeId)

      // 2. Start with the Base Identity & Rules
      let content = basePrompt

      // 3. Build and add the Roadmap
      content += getRoadmap(queueName, pipeline, phone)

      // 4. Add Instructions based on context
      if (!queueName) {
         content += `\n\n# CURRENT STATUS\nReady to process new documents.`
      } else {
         // Add Specific Stage Instructions
         const instructionKey = `../prompts/stages/${queueName}/instructions.md`
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         const instructions = (instructionModules as any)[instructionKey]

         if (instructions) {
            content += `\n\n${instructions}`
         } else {
            log.error({ queueName, notifyPhone: phone }, `No prompt instructions found for stage: ${queueName}`)
            throw new Error(`No prompt instructions found for stage: ${queueName}`)
         }
      }
      
      return content
   }
}

/**
 * Builds a markdown string representing the process roadmap. (Private helper)
 * @param currentStage - The current active stage.
 * @param pipeline - The store's full pipeline definition.
 * @param phone - The user's phone for notifications on errors.
 */
function getRoadmap(currentStage: string | undefined, pipeline: string[], phone: string): string {

   let roadmapContent = `\n\n# PROCESS OVERVIEW\nHere is the workflow for this store:\n`
   
   pipeline.forEach((stage, index) => {
      const isCurrent = stage === currentStage
      const isPast = currentStage ? pipeline.indexOf(currentStage) > index : false
      
      const descKey = `../prompts/stages/${stage}/description.md`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const description = (descriptionModules as any)[descKey]

      if (!description) {
         log.error({ stage, notifyPhone: phone }, `No description found for stage: ${stage}`)
         throw new Error(`No description found for stage: ${stage}`)
      }

      switch (true) {
         case isPast:
            roadmapContent += `${index + 1}. [COMPLETED] ${stage}: ${description}\n`
            break
         case isCurrent:
            roadmapContent += `${index + 1}. [CURRENT STAGE] ${stage}: ${description} <--- YOU ARE HERE\n`
            break
         default:
            roadmapContent += `${index + 1}. [PENDING] ${stage}: ${description}\n`
      }
   })
   return roadmapContent
}

