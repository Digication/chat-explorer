/**
 * Google Generative AI (Gemini) LLM provider.
 *
 * Key differences from OpenAI / Anthropic:
 *  - System instructions are passed via `systemInstruction`, not in the
 *    messages array.
 *  - The "assistant" role is called "model" in Google's API.
 *  - Chat is initiated with `startChat()` + `sendMessage()`.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMChatMessage, LLMOptions, LLMProvider } from "./provider.js";

export class GoogleProvider implements LLMProvider {
  readonly name = "google";
  private genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not set");
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async sendChat(
    messages: LLMChatMessage[],
    options: LLMOptions,
  ): Promise<string> {
    // Build a single system instruction from the option + any system messages
    // in the array.
    const systemParts: string[] = [];
    if (options.systemPrompt) {
      systemParts.push(options.systemPrompt);
    }

    // Separate system messages out; they become part of systemInstruction.
    const conversationMessages: LLMChatMessage[] = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        systemParts.push(msg.content);
      } else {
        conversationMessages.push(msg);
      }
    }

    const systemInstruction =
      systemParts.length > 0 ? systemParts.join("\n\n") : undefined;

    // Get the generative model with optional system instruction.
    const model = this.genAI.getGenerativeModel({
      model: options.model,
      ...(systemInstruction ? { systemInstruction } : {}),
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 16384,
      },
    });

    // The last message in the array is the one we actually "send".
    // Everything before it becomes the chat history.
    const history = conversationMessages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastMessage =
      conversationMessages[conversationMessages.length - 1];
    if (!lastMessage) {
      throw new Error("No messages to send to Google AI");
    }

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage.content);
    const response = result.response;
    const text = response.text();

    if (!text) {
      throw new Error("Google AI returned an empty response");
    }
    return text;
  }
}
