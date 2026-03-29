/**
 * Barrel export for the LLM layer.
 *
 * Import everything you need from this single path:
 *   import { getLLMProvider, MODEL_CATALOG } from "./llm/index.js";
 */

export {
  type LLMChatMessage,
  type LLMOptions,
  type LLMProvider,
  type ProviderName,
  MODEL_CATALOG,
  getAvailableProviders,
  getLLMProvider,
} from "./provider.js";
