import rexail from './rexail'
import { ProcessCallbackFunction } from 'bull'
import { JobData } from '../../types/jobs'

/**
 * A map of all available inventory update processors.
 * The key is the system name (which will be stored in the store's configuration)
 * and the value is the processor function itself.
 *
 * This map is used to dynamically register named processors with the Bull queue.
 */
export const inventoryProcessors: Record<
  string,
  ProcessCallbackFunction<JobData>
> = {
  rexail,
  // To add a new system (e.g., 'odoo'), create the processor file,
  // import it as default, and add it to this map:
  // odoo,
} 