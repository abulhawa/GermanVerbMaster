import Groq from "groq-sdk";
import { logStructured } from "../logger.js";

const PRONUNCIATION_MODEL = "llama-3.3-70b-versatile";
const PRONUNCIATION_CACHE_MAX_SIZE = 2000;

const SYSTEM_PROMPT =
  "You are a German pronunciation guide. Give a single short pronunciation hint for a German word form in English. Max 1 sentence. Focus on tricky sounds: ch, ü, ö, ä, ei, ie, eu, ß, final -ig. If pronunciation is straightforward, say 'Pronounced as written.' Respond with ONLY the hint sentence, no JSON.";

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const pronunciationCache = new Map<string, string | null>();

function setCachedHint(cacheKey: string, hint: string | null): void {
  if (pronunciationCache.has(cacheKey)) {
    pronunciationCache.delete(cacheKey);
  } else if (pronunciationCache.size >= PRONUNCIATION_CACHE_MAX_SIZE) {
    const oldest = pronunciationCache.keys().next().value as string | undefined;
    if (oldest) {
      pronunciationCache.delete(oldest);
    }
  }
  pronunciationCache.set(cacheKey, hint);
}

export async function getPronunciationHint(
  lemma: string,
  form: string,
): Promise<string | null> {
  const startTime = Date.now();
  const trimmedLemma = lemma.trim();
  const trimmedForm = form.trim();
  const cacheKey = `${trimmedLemma}::${trimmedForm}`;
  let cacheHit = false;

  try {
    if (!trimmedLemma || !trimmedForm) {
      return null;
    }

    const cached = pronunciationCache.get(cacheKey);
    if (cached !== undefined) {
      cacheHit = true;
      pronunciationCache.delete(cacheKey);
      pronunciationCache.set(cacheKey, cached);
      return cached;
    }

    if (!process.env.GROQ_API_KEY || !groq) {
      return null;
    }

    const response = await groq.chat.completions.create({
      model: PRONUNCIATION_MODEL,
      max_tokens: 60,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `How do you pronounce '${trimmedForm}' (from verb '${trimmedLemma}')`,
        },
      ],
    });

    const hint = response.choices[0]?.message?.content?.trim() || null;
    setCachedHint(cacheKey, hint);
    return hint;
  } catch (error) {
    logStructured({
      event: "groq.pronunciation.error",
      level: "error",
      source: "pronunciation-hint",
      message: "Pronunciation hint generation failed",
      error,
    });
    return null;
  } finally {
    logStructured({
      event: "groq.pronunciation",
      source: "pronunciation-hint",
      data: {
        durationMs: Date.now() - startTime,
        cacheHit,
      },
    });
  }
}

