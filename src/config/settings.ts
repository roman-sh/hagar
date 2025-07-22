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
 * Do not reduce the dimensions default of 3072.
 */
export const EMBEDDING_MODEL_CONFIG = {
   model: 'text-embedding-3-large',
}

/**
 * The name of the MongoDB vector search index for product embeddings.
 */
export const VECTOR_SEARCH_INDEX_NAME = 'name_embedding_index_3072'

/**
 * The name of the MongoDB Atlas Search index for product name lemmas.
 */
export const TEXT_SEARCH_INDEX_NAME = 'name-lemmas'

/**
 * The model identifier for auxiliary, non-conversational AI tasks.
 * This model is used for powerful, one-off operations like data structuring,
 * review, and mapping, where a direct, structured response is required.
 * We use 'o3' for these tasks, as it is cost-effective and powerful.
 */
export const AUX_MODEL = 'o3' // do not change this