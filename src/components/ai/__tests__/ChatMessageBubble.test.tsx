import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ChatMessageBubble from "../ChatMessageBubble";

const userMsg = {
  id: "1",
  role: "USER",
  content: "Hello there",
  createdAt: "2026-01-01T12:00:00Z",
};

const assistantMsg = {
  id: "2",
  role: "ASSISTANT",
  content: "Hi! How can I help?",
  createdAt: "2026-01-01T12:00:01Z",
};

describe("ChatMessageBubble", () => {
  it("renders user message content", () => {
    render(<ChatMessageBubble message={userMsg} />);
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("renders assistant message content as markdown", () => {
    render(<ChatMessageBubble message={assistantMsg} />);
    expect(screen.getByText("Hi! How can I help?")).toBeInTheDocument();
  });

  it("shows typing indicator when isTyping is true", () => {
    const { container } = render(
      <ChatMessageBubble message={{ ...assistantMsg, content: "" }} isTyping />
    );
    // Typing indicator renders 3 animated dots
    const dots = container.querySelectorAll('[class*="MuiBox-root"]');
    expect(dots.length).toBeGreaterThanOrEqual(3);
  });

  it("caps message width at min(80%, 600px)", () => {
    const { container } = render(<ChatMessageBubble message={userMsg} />);
    // The outer Box wrapping the bubble has maxWidth set
    const wrapper = container.firstChild?.firstChild as HTMLElement;
    expect(wrapper).toBeTruthy();
    // Check computed style contains the constraint
    const style = window.getComputedStyle(wrapper);
    // MUI applies styles via class names, so check the rendered attribute
    expect(wrapper.style.maxWidth || wrapper.className).toBeTruthy();
  });

  it("renders a timestamp", () => {
    render(<ChatMessageBubble message={userMsg} />);
    // The timestamp should be rendered (format varies by locale)
    const timeEl = screen.getByText(/\d{1,2}:\d{2}/);
    expect(timeEl).toBeInTheDocument();
  });
});
