import { Job } from 'bull'
import { JobData } from '../../types/jobs'
import { database } from '../../services/db'
import { catalog } from '../../systems/rexail/catalog'

/**
 * Bull processor for the 'rexail' inventory update job.
 * This processor is named and will only be called for jobs explicitly named 'rexail'.
 *
 * @param job The Bull job object, where job.id is the document ID.
 * @returns An unresolved promise to keep the job in an active state.
 */
export default async function rexailInventoryUpdateProcessor (
  job: Job<JobData>
): Promise<void> {
  const docId = job.id as string
  log.info({ docId }, 'Starting Rexail inventory update process.')

  // 1. Get the store details from the database using the document/job ID.
  const store = await database.getStoreByDocId(docId)
  const storeId = store.storeId

  // 2. Populate the catalog for the specific store in db's products collection.
  await catalog.sync(storeId)

  await job.progress(50)

  // 3. For now, we will pause here.
  // The next steps will involve matching and user interaction.

  // The job will hang here until completed by an external trigger (e.g., AI tool).
  return new Promise(() => {})
}
