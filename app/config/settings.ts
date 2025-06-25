/**
 * Application-wide settings and feature flags.
 */


/**
 * The default cooldown period in minutes between catalog sync attempts for a store.
 * This prevents redundant API calls and processing if the catalog hasn't changed.
 * This value can be overridden by the `syncCooldownMinutes` property on a
 * specific store's `catalog` object in the database.
 */
export const DEFAULT_SYNC_COOLDOWN_MINUTES = 30

/**
 * Configuration for the OpenAI embedding model used for product catalog vector search.
 *
 * - `model`: We use `text-embedding-3-large` as it provides the highest accuracy.
 * - `dimensions`: We have explicitly set this to 256. According to OpenAI's benchmarks,
 *   this offers a massive reduction in vector size (from 3072) and cost, while resulting
 *   in only a minor drop in retrieval accuracy (MTEB score 64.6 -> 62.0). This provides
 *   an excellent balance of performance and precision for our use case. If this property
 *   is removed, the model will default to its full 3072 dimensions.
 *
 * @see https://openai.com/blog/new-embedding-models-and-api-updates
 */
export const EMBEDDING_MODEL_CONFIG = {
   model: 'text-embedding-3-large',
   dimensions: 256,
}