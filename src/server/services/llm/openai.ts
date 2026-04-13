/**
 * OpenAI LLM provider – wraps the `openai` SDK.
 */

import OpenAI from "openai";
import type { LLMChatMessage, LLMOptions, LLMProvider } from "./provider.js";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor() {
    // The SDK reads OPENAI_API_KEY from the environment automatically,
    // but we pass it explicitly for clarity.
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async sendChat(
    messages: LLMChatMessage[],
    options: LLMOptions,
  ): Promise<string> {
    // If a systemPrompt was supplied in options, prepend it as a system message.
    const allMessages: LLMChatMessage[] = options.systemPrompt
      ? [{ role: "system", content: options.systemPrompt }, ...messages]
      : messages;

    // Map our generic message shape to the OpenAI SDK's expected format.
    const formatted = allMessages.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    }));

    const response = await this.client.chat.completions.create({
      model: options.model,
      messages: formatted,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 16384,
    });

    // The first choice always contains the assistant reply.
    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new Error("OpenAI returned an empty response");
    }
    return text;
  }
}
