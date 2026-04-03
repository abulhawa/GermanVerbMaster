import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { getB2WritingFeedback } from "../services/groq-b2-feedback.js";
import { getPronunciationHint } from "../services/groq-pronunciation-hint.js";

const b2FeedbackSchema = z.object({
  scenario: z.string().trim().min(1),
  userResponse: z.string().trim().min(1),
  keyPhrases: z.array(z.string().trim().min(1)).default([]),
  grammarFocus: z.string().trim().min(1),
});

const pronunciationHintSchema = z.object({
  lemma: z.string().trim().min(1),
  form: z.string().trim().min(1),
});

const b2FeedbackRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
  statusCode: 429,
});

const pronunciationHintRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
  statusCode: 429,
});

export function createAiRouter(): Router {
  const router = Router();

  router.post("/b2/feedback", b2FeedbackRateLimit, async (req, res) => {
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({
        error: "AI feedback not available",
        code: "GROQ_UNAVAILABLE",
      });
    }

    const parsed = b2FeedbackSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid B2 feedback payload",
        code: "INVALID_B2_FEEDBACK_PAYLOAD",
        details: parsed.error.flatten(),
      });
    }

    const feedback = await getB2WritingFeedback(parsed.data);
    return res.json(feedback);
  });

  router.post(
    "/pronunciation-hint",
    pronunciationHintRateLimit,
    async (req, res) => {
      const parsed = pronunciationHintSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid pronunciation hint payload",
          code: "INVALID_PRONUNCIATION_HINT_PAYLOAD",
          details: parsed.error.flatten(),
        });
      }

      if (!process.env.GROQ_API_KEY) {
        return res.json({ hint: null });
      }

      const hint = await getPronunciationHint(
        parsed.data.lemma,
        parsed.data.form,
      );
      return res.json({ hint });
    },
  );

  return router;
}

