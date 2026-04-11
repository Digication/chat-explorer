/**
 * Tests for LLM provider factory and model catalog.
 *
 * Provider constructors are mocked to avoid real SDK imports.
 * Environment variables are managed with vi.stubEnv() / vi.unstubAllEnvs()
 * to prevent leaking into other test files.
 *
 * Run with: docker compose exec app pnpm test
 */
import { describe, it, expect, vi, afterEach } from "vitest";

// --- Mock provider constructors before importing the module under test ---

// Use class mocks so `new Provider()` works correctly
vi.mock("./openai.js", () => ({
  OpenAIProvider: vi.fn(function (this: { name: string }) {
    this.name = "openai";
  }),
}));

vi.mock("./anthropic.js", () => ({
  AnthropicProvider: vi.fn(function (this: { name: string }) {
    this.name = "anthropic";
  }),
}));

vi.mock("./google.js", () => ({
  GoogleProvider: vi.fn(function (this: { name: string }) {
    this.name = "google";
  }),
}));

import {
  getAvailableProviders,
  getLLMProvider,
  MODEL_CATALOG,
} from "./provider.js";

describe("LLM provider factory", () => {
  // Restore all stubbed env vars after each test to prevent cross-test pollution.
  // This is critical: the server test-setup.ts uses DATABASE_URL from process.env
  // and corrupting it would break every other server test.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // --- getAvailableProviders ---

  it("getAvailableProviders returns empty array when no API keys are set", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GOOGLE_AI_API_KEY", "");

    expect(getAvailableProviders()).toEqual([]);
  });

  it("getAvailableProviders includes 'openai' when OPENAI_API_KEY is set", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GOOGLE_AI_API_KEY", "");

    expect(getAvailableProviders()).toContain("openai");
  });

  it("getAvailableProviders includes 'google' when GOOGLE_AI_API_KEY is set", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GOOGLE_AI_API_KEY", "google-test-key");

    expect(getAvailableProviders()).toContain("google");
  });

  it("getAvailableProviders returns all 3 providers when all keys are set", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("ANTHROPIC_API_KEY", "ant-test");
    vi.stubEnv("GOOGLE_AI_API_KEY", "google-test");

    const providers = getAvailableProviders();
    expect(providers).toHaveLength(3);
    expect(providers).toContain("openai");
    expect(providers).toContain("anthropic");
    expect(providers).toContain("google");
  });

  // --- getLLMProvider ---

  it("getLLMProvider('google') returns a provider when GOOGLE_AI_API_KEY is set", () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "google-test-key");

    const provider = getLLMProvider("google");
    expect(provider.name).toBe("google");
  });

  it("getLLMProvider('openai') throws when OPENAI_API_KEY is missing", () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    expect(() => getLLMProvider("openai")).toThrow();
  });

  it("getLLMProvider throws for an unknown provider name", () => {
    // TypeScript won't allow 'unknown' as ProviderName, so cast it
    expect(() => getLLMProvider("unknown" as never)).toThrow();
  });

  // --- MODEL_CATALOG ---

  it("MODEL_CATALOG has entries for all 3 providers, each with id and label", () => {
    for (const providerName of ["openai", "anthropic", "google"] as const) {
      const models = MODEL_CATALOG[providerName];
      expect(models, `${providerName} should have models`).toBeDefined();
      expect(models.length, `${providerName} should have at least 1 model`).toBeGreaterThan(0);
      for (const model of models) {
        expect(model, `${providerName} model should have id`).toHaveProperty("id");
        expect(model, `${providerName} model should have label`).toHaveProperty("label");
        expect(typeof model.id).toBe("string");
        expect(typeof model.label).toBe("string");
      }
    }
  });
});
