import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("groq leniency service", () => {
  const originalGroqApiKey = process.env.GROQ_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalGroqApiKey === undefined) {
      delete process.env.GROQ_API_KEY;
    } else {
      process.env.GROQ_API_KEY = originalGroqApiKey;
    }
  });

  it("accepts umlaut variants and close edit-distance answers but rejects distant words", async () => {
    delete process.env.GROQ_API_KEY;

    const { isCloseEnough } = await import("../server/services/groq-leniency.js");

    expect(isCloseEnough("Häuser", "haeuser")).toBe(true);
    expect(isCloseEnough("macht", "mach")).toBe(true);
    expect(isCloseEnough("gehen", "laufen")).toBe(false);
  });

  it("caches repeated leniency checks for identical expected/submitted values", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    const createCompletionMock = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content:
              '{"isAcceptable": true, "confidence": "high", "reason": "Missing umlaut, otherwise correct", "suggestion": "fährt"}',
          },
        },
      ],
    });

    vi.doMock("groq-sdk", () => {
      class GroqMock {
        chat = {
          completions: {
            create: createCompletionMock,
          },
        };
      }
      return { default: GroqMock };
    });

    const { checkAnswerLeniency } = await import("../server/services/groq-leniency.js");

    const first = await checkAnswerLeniency({
      lemma: "fahren",
      taskType: "conjugate_form",
      expectedForm: "fährt",
      submittedForm: "faehrt",
      cefrLevel: "A2",
    });
    const second = await checkAnswerLeniency({
      lemma: "fahren",
      taskType: "conjugate_form",
      expectedForm: "fährt",
      submittedForm: "faehrt",
      cefrLevel: "A2",
    });

    expect(first.isAcceptable).toBe(true);
    expect(second.isAcceptable).toBe(true);
    expect(createCompletionMock).toHaveBeenCalledTimes(1);
  });

  it("returns a non-acceptable result without throwing when Groq is unavailable", async () => {
    delete process.env.GROQ_API_KEY;

    const { checkAnswerLeniency } = await import("../server/services/groq-leniency.js");

    await expect(
      checkAnswerLeniency({
        lemma: "gehen",
        taskType: "conjugate_form",
        expectedForm: "geht",
        submittedForm: "gejt",
        cefrLevel: "A1",
      }),
    ).resolves.toMatchObject({
      isAcceptable: false,
    });
  });
});

