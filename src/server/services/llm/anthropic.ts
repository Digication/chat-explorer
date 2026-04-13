/**
 * Anthropic LLM provider – wraps the `@anthropic-ai/sdk` package.
 *
 * The Anthropic API treats "system" messages differently: instead of
 * including them in the messages array, they go into a dedicated
 * `system` parameter. This adapter handles that conversion.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LLMChatMessage, LLMOptions, LLMProvider } from "./provider.js";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async sendChat(
    messages: LLMChatMessage[],
    options: LLMOptions,
  ): Promise<string> {
    // Collect system-level text. Anthropic expects it as a separate param.
    const systemParts: string[] = [];
    if (options.systemPrompt) {
      systemParts.push(options.systemPrompt);
    }

    // Filter out system messages from the array and add their content
    // to the system parameter instead.
    const conversationMessages: { role: "user" | "assistant"; content: string }[] = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        systemParts.push(msg.content);
      } else {
        conversationMessages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    }

    const systemText = systemParts.length > 0
      ? systemParts.join("\n\n")
      : undefined;

    const response = await this.client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 16384,
      temperature: options.temperature ?? 0.7,
      ...(systemText ? { system: systemText } : {}),
      messages: conversationMessages,
    });

    // Anthropic returns an array of content blocks; pull out the text.
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Anthropic returned no text content");
    }
    return textBlock.text;
  }
}
