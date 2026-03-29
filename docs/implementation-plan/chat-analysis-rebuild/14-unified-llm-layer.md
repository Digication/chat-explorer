# Phase 14 — Unified LLM Layer

You are building the provider abstraction layer for multiple LLM providers in the **Chat Analysis** app.

**Context:** Phases 01–13 built the complete application with AI chat defaulting to direct OpenAI calls via the `openai` SDK. This phase replaces that direct dependency with a provider abstraction so users can choose between OpenAI, Anthropic, and Google models. The AI chat service in `src/server/services/ai-chat.ts` currently imports `OpenAI` directly and calls `openai.chat.completions.create()`.

## Goal

Create a unified LLM interface so the app can talk to OpenAI, Anthropic, or Google with a single API. Add a model picker to the UI. Store the user's preferred provider and model in their profile. Update the AI chat service to use the new abstraction instead of calling OpenAI directly.

## Overview

- Define a `LLMProvider` interface with a `sendChat` method
- Implement three providers: OpenAI, Anthropic, Google
- Create a factory function to get the right provider by name
- ONLY these three providers are supported — no LLaMA, Grok, DeepSeek, or others
- Add a model picker UI component
- Store user preference in the User entity
- Update the AI chat service to use the LLM layer
- Disable providers whose API key is not set in the environment

## Steps

### 1. Define the LLM provider interface

**Files to create:** `src/server/services/llm/provider.ts`

```typescript
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMOptions {
  model: string;
  temperature?: number;     // default 0.7
  maxTokens?: number;       // default 2000
  systemPrompt?: string;    // prepended as a system message
}

export interface LLMProvider {
  readonly name: string;
  sendChat(messages: ChatMessage[], options: LLMOptions): Promise<string>;
}

// Allowed providers — no others should be added
export type ProviderName = "openai" | "anthropic" | "google";

// Model catalog — the only models exposed in the UI
export const MODEL_CATALOG: Record<ProviderName, { id: string; label: string }[]> = {
  openai: [
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-5-20250514", label: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
  google: [
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
};

/**
 * Returns which providers are available based on environment variables.
 * A provider is available only if its API key is set.
 */
export function getAvailableProviders(): ProviderName[] {
  const available: ProviderName[] = [];
  if (process.env.OPENAI_API_KEY) available.push("openai");
  if (process.env.ANTHROPIC_API_KEY) available.push("anthropic");
  if (process.env.GOOGLE_AI_API_KEY) available.push("google");
  return available;
}

/**
 * Factory: returns the correct LLMProvider implementation.
 * Throws if the provider name is invalid or its API key is not set.
 */
export function getLLMProvider(providerName: ProviderName): LLMProvider {
  switch (providerName) {
    case "openai":
      if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
      // dynamic import to avoid loading SDKs that aren't needed
      return new (require("./openai").OpenAIProvider)();
    case "anthropic":
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
      return new (require("./anthropic").AnthropicProvider)();
    case "google":
      if (!process.env.GOOGLE_AI_API_KEY) throw new Error("GOOGLE_AI_API_KEY not set");
      return new (require("./google").GoogleProvider)();
    default:
      throw new Error(`Unknown LLM provider: ${providerName}`);
  }
}
```

### 2. Implement OpenAI provider

**Files to create:** `src/server/services/llm/openai.ts`

```typescript
import OpenAI from "openai";
import type { LLMProvider, ChatMessage, LLMOptions } from "./provider.js";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async sendChat(messages: ChatMessage[], options: LLMOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: options.model,
      messages,
      max_tokens: options.maxTokens ?? 2000,
      temperature: options.temperature ?? 0.7,
    });
    return response.choices[0]?.message?.content || "No response generated.";
  }
}
```

### 3. Implement Anthropic provider

**Files to create:** `src/server/services/llm/anthropic.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ChatMessage, LLMOptions } from "./provider.js";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async sendChat(messages: ChatMessage[], options: LLMOptions): Promise<string> {
    // Anthropic separates system prompt from messages
    const systemMessages = messages.filter((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");
    const systemPrompt = systemMessages.map((m) => m.content).join("\n\n");

    const response = await this.client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 2000,
      temperature: options.temperature ?? 0.7,
      system: systemPrompt || undefined,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    // Extract text from content blocks
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.text || "No response generated.";
  }
}
```

### 4. Implement Google provider

**Files to create:** `src/server/services/llm/google.ts`

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMProvider, ChatMessage, LLMOptions } from "./provider.js";

export class GoogleProvider implements LLMProvider {
  readonly name = "google";
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
  }

  async sendChat(messages: ChatMessage[], options: LLMOptions): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: options.model });

    // Convert messages to Google's format
    // System messages become the systemInstruction
    const systemMessages = messages.filter((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    const chat = model.startChat({
      history: chatMessages.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      systemInstruction: systemMessages.length
        ? { role: "user", parts: [{ text: systemMessages.map((m) => m.content).join("\n\n") }] }
        : undefined,
    });

    const lastMessage = chatMessages[chatMessages.length - 1];
    const result = await chat.sendMessage(lastMessage.content);
    return result.response.text() || "No response generated.";
  }
}
```

### 5. Create the barrel export

**Files to create:** `src/server/services/llm/index.ts`

```typescript
export { getLLMProvider, getAvailableProviders, MODEL_CATALOG } from "./provider.js";
export type { LLMProvider, ChatMessage, LLMOptions, ProviderName } from "./provider.js";
```

### 6. Update the AI chat service

**Files to modify:** `src/server/services/ai-chat.ts`

Replace the direct OpenAI import and usage with the unified LLM layer:

- Remove `import OpenAI from "openai"` and the `openai` client instantiation
- Import `getLLMProvider` and `ChatMessage` from `./llm/index.js`
- Update `generateAiResponse` to accept `providerName` and `model` parameters
- Call `getLLMProvider(providerName).sendChat(messages, { model, temperature: 0.7, maxTokens: 2000 })` instead of `openai.chat.completions.create()`
- The ChatResolver should read the user's preferred provider/model from their User record and pass it through

### 7. Add user preference fields

**Files to modify:** `src/server/entities/User.ts`

Add two columns to the User entity:

```typescript
@Column({ type: "varchar", length: 20, default: "openai" })
preferredLlmProvider!: string;

@Column({ type: "varchar", length: 50, default: "gpt-4o" })
preferredLlmModel!: string;
```

### 8. Create the ModelPicker UI component

**Files to create or modify:** `src/components/ai/ModelPicker.tsx`

A compact dropdown/menu in the AI chat panel that lets users pick their preferred model:

- Groups models by provider (OpenAI, Anthropic, Google)
- Disables providers whose API key is not configured (query a GraphQL endpoint that returns available providers)
- Shows the currently selected model with a small icon
- On change, saves the preference via a GraphQL mutation and uses it for subsequent messages
- Fits in the AI chat panel header area, not a full page

Add a GraphQL query `availableProviders` that returns the list from `getAvailableProviders()` and the model catalog, so the frontend knows which providers to enable.

### 9. Add the availableProviders query

**Files to modify:** `src/server/resolvers/ChatResolver.ts`

```typescript
@Query(() => [AvailableProvider])
availableProviders(): AvailableProvider[] {
  const available = getAvailableProviders();
  return available.map((name) => ({
    name,
    models: MODEL_CATALOG[name],
  }));
}
```

Define the `AvailableProvider` GraphQL type in `src/server/types/llm.ts`.

## Files to Create

| File | Purpose |
|------|---------|
| `src/server/services/llm/provider.ts` | LLMProvider interface, factory, model catalog |
| `src/server/services/llm/openai.ts` | OpenAI provider implementation |
| `src/server/services/llm/anthropic.ts` | Anthropic provider implementation |
| `src/server/services/llm/google.ts` | Google provider implementation |
| `src/server/services/llm/index.ts` | Barrel export |
| `src/server/types/llm.ts` | GraphQL types for provider/model data |

## Files to Modify

| File | Change |
|------|--------|
| `src/server/services/ai-chat.ts` | Replace direct OpenAI calls with getLLMProvider() |
| `src/server/entities/User.ts` | Add preferredLlmProvider and preferredLlmModel columns |
| `src/server/resolvers/ChatResolver.ts` | Add availableProviders query, pass provider/model to AI service |
| `src/components/ai/ModelPicker.tsx` | Create or update model picker UI |
| `src/components/ai/AiChatPanel.tsx` | Integrate ModelPicker into chat panel header |

## Verification

```bash
docker compose up -d --build
docker compose exec app pnpm typecheck
docker compose exec app pnpm build
```

Expected: TypeScript compiles. Build succeeds. The model picker appears in the AI chat panel. Only providers with configured API keys are selectable. Switching providers and sending a message produces a response from the selected model. The user's preference is saved and persists across page reloads.

## When done

Report: files created/modified (with summary per file), verification results, and any issues encountered.
