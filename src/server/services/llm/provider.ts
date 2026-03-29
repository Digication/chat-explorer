/**
 * LLM Provider interfaces and model catalog.
 *
 * Defines the contract every AI provider must implement, lists the
 * supported models, and provides helpers to discover which providers
 * have API keys configured at runtime.
 */

import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { GoogleProvider } from "./google.js";

// -- Message shape shared by all providers ---------------------------------

export interface LLMChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// -- Options passed to every provider call ---------------------------------

export interface LLMOptions {
  model: string;
  temperature?: number; // default 0.7
  maxTokens?: number; // default 2000
  systemPrompt?: string;
}

// -- Provider interface each SDK adapter must satisfy ----------------------

export interface LLMProvider {
  readonly name: string;
  sendChat(messages: LLMChatMessage[], options: LLMOptions): Promise<string>;
}

// -- Supported provider names & model catalog ------------------------------

export type ProviderName = "openai" | "anthropic" | "google";

export const MODEL_CATALOG: Record<
  ProviderName,
  { id: string; label: string }[]
> = {
  openai: [
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-5-20250514", label: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
  google: [
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro-preview-05-06", label: "Gemini 2.5 Pro" },
  ],
};

// -- Runtime helpers -------------------------------------------------------

/** Return only the providers whose API key is present in the environment. */
export function getAvailableProviders(): ProviderName[] {
  const available: ProviderName[] = [];
  if (process.env.OPENAI_API_KEY) available.push("openai");
  if (process.env.ANTHROPIC_API_KEY) available.push("anthropic");
  if (process.env.GOOGLE_AI_API_KEY) available.push("google");
  return available;
}

/**
 * Instantiate the requested provider.
 */
export function getLLMProvider(providerName: ProviderName): LLMProvider {
  switch (providerName) {
    case "openai": {
      if (!process.env.OPENAI_API_KEY)
        throw new Error("OPENAI_API_KEY not set");
      return new OpenAIProvider();
    }
    case "anthropic": {
      if (!process.env.ANTHROPIC_API_KEY)
        throw new Error("ANTHROPIC_API_KEY not set");
      return new AnthropicProvider();
    }
    case "google": {
      if (!process.env.GOOGLE_AI_API_KEY)
        throw new Error("GOOGLE_AI_API_KEY not set");
      return new GoogleProvider();
    }
    default:
      throw new Error(`Unknown LLM provider: ${providerName}`);
  }
}
