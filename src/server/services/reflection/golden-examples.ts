import { ReflectionCategory } from "../../entities/CommentReflectionClassification.js";

/**
 * Hand-curated examples of student comments for each Hatton & Smith category.
 *
 * Used as:
 *   1. Few-shot examples in the classifier prompt.
 *   2. Anchors for an integration test that runs against the real Gemini
 *      API to detect prompt drift (skipped in CI).
 *
 * The text below is illustrative — when running the prompt-drift test you
 * should replace these with real anonymized comments from the corpus.
 */
export interface GoldenExample {
  text: string;
  expected: ReflectionCategory;
  // Why this example belongs in this category — for human reviewers, not
  // sent to the model.
  note: string;
}

export const GOLDEN_EXAMPLES: GoldenExample[] = [
  // ───────── Descriptive Writing — pure narration, no analysis ─────────
  {
    text: "We built a circuit on the breadboard with a resistor, an LED, and a 9V battery. The LED lit up.",
    expected: ReflectionCategory.DESCRIPTIVE_WRITING,
    note: "Pure recount of events. No why, no challenge, no self-talk.",
  },
  {
    text: "The textbook chapter covered Ohm's law, Kirchhoff's voltage law, and Kirchhoff's current law.",
    expected: ReflectionCategory.DESCRIPTIVE_WRITING,
    note: "Reports literature without engagement.",
  },

  // ─── Descriptive Reflection — explains rationale, mentions challenge/iteration ───
  {
    text: "The op-amp kept saturating because the gain was too high. I had to redesign the feedback network three times before the output was stable.",
    expected: ReflectionCategory.DESCRIPTIVE_REFLECTION,
    note: "Explains why something was hard and describes iterating to fix it.",
  },
  {
    text: "Soldering surface-mount components is harder than through-hole because the pads are tiny and the iron tip is bigger than the pad.",
    expected: ReflectionCategory.DESCRIPTIVE_REFLECTION,
    note: "Explains a challenge rooted in the nature of the work itself.",
  },

  // ─── Dialogic Reflection — discourse with self, personal/metacognitive ───
  {
    text: "I realized I've been afraid of touching the oscilloscope because I broke one in high school. I want to get over that — debugging is half the job and I can't keep avoiding it.",
    expected: ReflectionCategory.DIALOGIC_REFLECTION,
    note: "Personal history, emotion, recognized lack of skill, desire to grow.",
  },
  {
    text: "Looking back at my notes, I notice I keep skipping the 'why' step and jumping to formulas. I think I do that because I'm scared of getting the conceptual question wrong.",
    expected: ReflectionCategory.DIALOGIC_REFLECTION,
    note: "Metacognition + emotional honesty about a personal pattern.",
  },

  // ─── Critical Reflection — connects to broader contexts beyond self ───
  {
    text: "This project reminds me of my summer internship at the hospital — the same signal-conditioning tricks we used in lab show up in EKG front-ends. Makes me think this stuff transfers to medical devices.",
    expected: ReflectionCategory.CRITICAL_REFLECTION,
    note: "Transfer from course to job, course to a different domain.",
  },
  {
    text: "If consumer electronics manufacturers used this kind of lifecycle analysis we'd have a lot less e-waste. The class is making me think about engineering as a public-good profession, not just a technical one.",
    expected: ReflectionCategory.CRITICAL_REFLECTION,
    note: "Connects topic to societal/political context beyond the individual.",
  },
];
