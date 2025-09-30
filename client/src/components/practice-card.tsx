import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/primitives/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { speak } from "@/lib/speech";
import { GermanVerb } from "@/lib/verbs";
import { PracticeMode, Settings } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { submitPracticeAttempt } from "@/lib/api";
import { AlertCircle, CheckCircle2, HelpCircle, Volume2, XCircle } from "lucide-react";

export interface PracticeAnswerDetails {
  verb: GermanVerb;
  mode: PracticeMode;
  isCorrect: boolean;
  attemptedAnswer: string;
  correctAnswer: string;
  prompt: string;
  timeSpent: number;
}

interface PracticeCardProps {
  verb: GermanVerb;
  mode: PracticeMode;
  settings: Settings;
  onCorrect: () => void;
  onIncorrect: () => void;
  onAnswer?: (details: PracticeAnswerDetails) => void;
  className?: string;
}

type PracticeStatus = "idle" | "correct" | "incorrect";

export function PracticeCard({
  verb,
  mode,
  settings,
  onCorrect,
  onIncorrect,
  onAnswer,
  className,
}: PracticeCardProps) {
  const [answer, setAnswer] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [status, setStatus] = useState<PracticeStatus>("idle");
  const startTimeRef = useRef(Date.now());
  const { toast } = useToast();

  const modeLabel = {
    präteritum: "Präteritum form",
    partizipII: "Partizip II form",
    auxiliary: "Auxiliary verb",
    english: "English meaning",
  }[mode];

  useEffect(() => {
    setAnswer("");
    setStatus("idle");
    setShowHint(false);
    startTimeRef.current = Date.now();
  }, [verb, mode]);

  const recordPracticeAttempt = async (isCorrect: boolean, timeSpent: number) => {
    try {
      const { queued } = await submitPracticeAttempt({
        verb: verb.infinitive,
        mode,
        result: isCorrect ? "correct" : "incorrect",
        attemptedAnswer: answer,
        timeSpent,
        level: settings.level,
        queuedAt: new Date(startTimeRef.current).toISOString(),
      });

      if (queued) {
        toast({
          title: "Saved offline",
          description: "We'll sync this attempt once you're back online.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to record practice attempt",
        tone: "danger",
      });
      console.error("Error recording practice:", error);
    }
  };

  const getQuestionText = () => {
    switch (mode) {
      case "präteritum":
        return "Give the Präteritum";
      case "partizipII":
        return "Give the Partizip II";
      case "auxiliary":
        return "Which auxiliary verb?";
      case "english":
        return "What is the English meaning?";
      default:
        return "";
    }
  };

  const getHintText = () => {
    if (!settings.showHints) return null;

    switch (mode) {
      case "präteritum":
        return settings.showExamples ? verb.präteritumExample : `Correct form: ${verb.präteritum}`;
      case "partizipII":
        return settings.showExamples ? verb.partizipIIExample : `Correct form: ${verb.partizipII}`;
      case "auxiliary":
        return `Auxiliary: ${verb.auxiliary}`;
      case "english":
        return `English translation: ${verb.english}`;
      default:
        return null;
    }
  };

  const pronounce = () => {
    let wordToPronounce = verb.infinitive;
    if (status !== "idle") {
      switch (mode) {
        case "präteritum":
          wordToPronounce = verb.präteritum;
          break;
        case "partizipII":
          wordToPronounce = verb.partizipII;
          break;
        case "auxiliary":
          wordToPronounce = verb.auxiliary;
          break;
        default:
          wordToPronounce = verb.infinitive;
      }
    }
    speak(wordToPronounce);
  };

  const checkAnswer = async () => {
    if (!answer.trim()) return;

    let correct = false;
    const cleanAnswer = answer.trim().toLowerCase();
    const promptText = getQuestionText();

    switch (mode) {
      case "präteritum":
        correct = cleanAnswer === verb.präteritum;
        break;
      case "partizipII":
        correct = cleanAnswer === verb.partizipII;
        break;
      case "auxiliary":
        correct = cleanAnswer === verb.auxiliary;
        break;
      case "english":
        correct = cleanAnswer === verb.english;
        break;
    }

    const timeSpent = Date.now() - startTimeRef.current;

    setStatus(correct ? "correct" : "incorrect");
    await recordPracticeAttempt(correct, timeSpent);

    onAnswer?.({
      verb,
      mode,
      isCorrect: correct,
      attemptedAnswer: answer.trim(),
      correctAnswer,
      prompt: promptText,
      timeSpent,
    });

    if (correct) {
      onCorrect();
    } else {
      onIncorrect();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && status === "idle") {
      checkAnswer();
    }
  };

  const revealHint = () => {
    setShowHint(true);
  };

  const feedbackCopy = status === "correct"
    ? "Correct! Keep the momentum going."
    : "Not quite. The correct answer is";

  const correctAnswer = mode === "präteritum"
    ? verb.präteritum
    : mode === "partizipII"
      ? verb.partizipII
      : mode === "auxiliary"
        ? verb.auxiliary
        : verb.english;

  return (
    <AnimatePresence mode="wait">
      <motion.section
        key={`${verb.infinitive}-${mode}`}
        initial={{ opacity: 0, y: 24, rotateX: -6 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        exit={{ opacity: 0, y: -24, rotateX: 6 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className={cn("w-full", className)}
      >
        <Card className="w-full p-2">
          <CardHeader className="space-y-4 text-center">
            <Badge
              tone="primary"
              size="sm"
              className="mx-auto rounded-full px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]"
            >
              {modeLabel}
            </Badge>
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-3">
                <CardTitle className="text-4xl font-semibold text-fg md:text-5xl">
                  {verb.infinitive}
                </CardTitle>
                <Button
                  variant="outline"
                  tone="primary"
                  onClick={pronounce}
                  title="Listen to pronunciation"
                  className="h-12 w-12 px-0"
                >
                  <Volume2 className="h-5 w-5" aria-hidden />
                </Button>
              </div>
              {mode !== "english" && (
                <p className="text-sm text-muted">
                  {verb.english}
                </p>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
                Prompt
              </p>
              <p className="text-lg font-semibold text-fg">
                {getQuestionText()}
              </p>
            </div>

            <Input
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your answer"
              size="lg"
              className="h-14 rounded-2xl border-2 text-center text-lg"
              disabled={status !== "idle"}
              autoFocus
            />

            <AnimatePresence>
              {settings.showHints && showHint && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-left text-sm text-muted"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 text-primary" aria-hidden />
                    <span>{getHintText()}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={checkAnswer} disabled={status !== "idle"} className="px-8">
                Check answer
              </Button>
              {settings.showHints && !showHint && (
                <Button
                  type="button"
                  variant="outline"
                  tone="primary"
                  onClick={revealHint}
                  className="px-6"
                >
                  <HelpCircle className="mr-2 h-4 w-4" aria-hidden />
                  Reveal hint
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <AnimatePresence mode="wait">
          {status !== "idle" && (
            <motion.div
              key={status}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              role="status"
              aria-live="polite"
              className={cn(
                "mt-4 w-full rounded-2xl border px-5 py-4 text-sm font-semibold shadow-sm",
                status === "correct"
                  ? "border-success bg-success/15 text-success"
                  : "border-danger bg-danger/10 text-danger",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {status === "correct" ? (
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                  ) : (
                    <XCircle className="h-4 w-4" aria-hidden />
                  )}
                  <span>{feedbackCopy}</span>
                </div>
                {status === "incorrect" && (
                  <span
                    className="rounded-full border border-danger bg-danger/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-danger"
                    aria-label={`Correct answer: ${correctAnswer}`}
                    title={`Correct answer: ${correctAnswer}`}
                  >
                    {correctAnswer}
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </AnimatePresence>
  );
}

export const PRACTICE_MODES: PracticeMode[] = ["präteritum", "partizipII", "auxiliary", "english"];
