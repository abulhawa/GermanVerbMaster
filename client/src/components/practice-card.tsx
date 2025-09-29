import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GermanVerb } from '@/lib/verbs';
import { PracticeMode, Settings } from '@/lib/types';
import { AlertCircle, CheckCircle2, HelpCircle, Volume2 } from 'lucide-react';
import { speak } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { submitPracticeAttempt } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PracticeCardProps {
  verb: GermanVerb;
  mode: PracticeMode;
  settings: Settings;
  onCorrect: () => void;
  onIncorrect: () => void;
  className?: string;
}

export function PracticeCard({
  verb,
  mode,
  settings,
  onCorrect,
  onIncorrect,
  className,
}: PracticeCardProps) {
  const [answer, setAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [status, setStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const startTimeRef = useRef(Date.now());
  const { toast } = useToast();

  const modeLabel = {
    präteritum: 'Präteritum form',
    partizipII: 'Partizip II form',
    auxiliary: 'Auxiliary verb',
    english: 'English meaning',
  }[mode];

  // Reset state when verb changes
  useEffect(() => {
    setAnswer('');
    setStatus('idle');
    setShowHint(false);
    startTimeRef.current = Date.now();
  }, [verb]);

  const recordPracticeAttempt = async (isCorrect: boolean) => {
    const timeSpent = Date.now() - startTimeRef.current;
    try {
      const { queued } = await submitPracticeAttempt({
        verb: verb.infinitive,
        mode,
        result: isCorrect ? 'correct' : 'incorrect',
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
        variant: "destructive",
      });
      console.error('Error recording practice:', error);
    }
  };

  const checkAnswer = async () => {
    if (!answer.trim()) return; // Don't check empty answers

    let correct = false;
    const cleanAnswer = answer.trim().toLowerCase();

    switch (mode) {
      case 'präteritum':
        correct = cleanAnswer === verb.präteritum;
        break;
      case 'partizipII':
        correct = cleanAnswer === verb.partizipII;
        break;
      case 'auxiliary':
        correct = cleanAnswer === verb.auxiliary;
        break;
      case 'english':
        correct = cleanAnswer === verb.english;
        break;
    }

    setStatus(correct ? 'correct' : 'incorrect');
    await recordPracticeAttempt(correct);

    if (correct) {
      onCorrect();
    } else {
      onIncorrect();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && status === 'idle') {
      checkAnswer();
    }
  };

  const getQuestionText = () => {
    switch (mode) {
      case 'präteritum':
        return "What is the Präteritum form?";
      case 'partizipII':
        return "What is the Partizip II form?";
      case 'auxiliary':
        return "Which auxiliary verb? (haben/sein)";
      case 'english':
        return "What is the English meaning?";
      default:
        return "";
    }
  };

  const getHintText = () => {
    if (!settings.showHints) return null;

    switch (mode) {
      case 'präteritum':
        return settings.showExamples ? verb.präteritumExample :
          `The correct form is: ${verb.präteritum}`;
      case 'partizipII':
        return settings.showExamples ? verb.partizipIIExample :
          `The correct form is: ${verb.partizipII}`;
      case 'auxiliary':
        return `The correct auxiliary is: ${verb.auxiliary}`;
      case 'english':
        return `The English translation is: ${verb.english}`;
      default:
        return null;
    }
  };

  const handlePronounce = () => {
    let wordToPronounce = verb.infinitive;
    if (status === 'correct' || status === 'incorrect') {
      switch (mode) {
        case 'präteritum':
          wordToPronounce = verb.präteritum;
          break;
        case 'partizipII':
          wordToPronounce = verb.partizipII;
          break;
        case 'auxiliary':
          wordToPronounce = verb.auxiliary;
          break;
      }
    }
    speak(wordToPronounce);
  };

  return (
    <Card
      className={cn(
        "relative overflow-hidden border border-border bg-card shadow-[0_20px_60px_rgba(37,99,235,0.08)] backdrop-blur-sm transition-all duration-500 hover:border-primary/60 hover:shadow-[0_26px_75px_rgba(37,99,235,0.16)]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.18),_transparent_70%)]" />
      <CardHeader className="relative z-10 flex flex-col items-center gap-3 pb-4 text-center">
        <Badge
          variant="outline"
          className="rounded-full border border-primary/30 bg-primary/10 text-xs uppercase tracking-[0.18em] text-primary"
        >
          {modeLabel}
        </Badge>
        <CardTitle className="flex flex-wrap items-center justify-center gap-3 text-3xl font-semibold">
          <span>{verb.infinitive}</span>
          <Button
            variant="secondary"
            size="icon"
            onClick={handlePronounce}
            title="Listen to pronunciation"
            className="h-10 w-10 rounded-full border border-border bg-muted/70 text-foreground transition hover:bg-muted"
          >
            <Volume2 className="h-4 w-4" />
          </Button>
        </CardTitle>
        {mode !== 'english' && (
          <p className="text-sm text-muted-foreground">
            {verb.english}
          </p>
        )}
      </CardHeader>
      <CardContent className="relative z-10 space-y-5">
        <div className="text-center text-base font-medium text-foreground">
          {getQuestionText()}
        </div>

        <Input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your answer..."
          className="h-12 rounded-2xl border border-border bg-background/70 text-center text-lg font-medium text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          disabled={status !== 'idle'}
        />

        {settings.showHints && showHint && (
          <Alert className="border border-border bg-muted/40 text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-primary" />
            <AlertDescription>{getHintText()}</AlertDescription>
          </Alert>
        )}

        {status === 'correct' && (
          <Alert className="border border-secondary/60 bg-secondary/15 text-secondary-foreground shadow-[0_10px_35px_rgba(16,185,129,0.18)]" role="status" aria-live="polite">
            <CheckCircle2 className="h-4 w-4 text-secondary" />
            <AlertDescription className="font-medium">Correct! Keep the momentum going.</AlertDescription>
          </Alert>
        )}

        {status === 'incorrect' && (
          <Alert className="border border-destructive/60 bg-destructive/10 text-destructive shadow-[0_10px_35px_rgba(220,38,38,0.18)]" role="status" aria-live="polite">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <AlertDescription className="flex flex-col gap-1 text-left">
              Not quite. The correct answer is:
              <span className="font-semibold text-destructive underline decoration-destructive/60 underline-offset-4">
                {
                  mode === 'präteritum'
                    ? verb.präteritum
                    : mode === 'partizipII'
                      ? verb.partizipII
                      : mode === 'auxiliary'
                        ? verb.auxiliary
                        : verb.english
                }
              </span>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {status === 'idle' && (
            <>
              <Button
                onClick={checkAnswer}
                className="h-11 rounded-full px-6 text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-primary/40"
              >
                Check answer
              </Button>
              {settings.showHints && (
                <Button
                  variant="ghost"
                  onClick={() => setShowHint(true)}
                  className="h-11 rounded-full border border-border bg-muted/60 px-5 text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                  <HelpCircle className="mr-2 h-4 w-4" />
                  Reveal hint
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export const PRACTICE_MODES: PracticeMode[] = ['präteritum', 'partizipII', 'auxiliary', 'english'];