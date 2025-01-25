import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GermanVerb } from '@/lib/verbs';
import { PracticeMode, Settings } from '@/lib/types';
import { AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';

interface PracticeCardProps {
  verb: GermanVerb;
  mode: PracticeMode;
  settings: Settings;
  onCorrect: () => void;
  onIncorrect: () => void;
}

export function PracticeCard({ verb, mode, settings, onCorrect, onIncorrect }: PracticeCardProps) {
  const [answer, setAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [status, setStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');

  const checkAnswer = () => {
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
    }

    setStatus(correct ? 'correct' : 'incorrect');
    if (correct) {
      onCorrect();
    } else {
      onIncorrect();
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center">
          <span className="text-2xl font-bold">{verb.infinitive}</span>
          <span className="text-sm text-muted-foreground block">
            ({verb.english})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center text-lg mb-4">
          {mode === 'präteritum' && "What is the Präteritum form?"}
          {mode === 'partizipII' && "What is the Partizip II form?"}
          {mode === 'auxiliary' && "Which auxiliary verb? (haben/sein)"}
        </div>

        <Input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your answer..."
          className="text-center text-lg"
          disabled={status !== 'idle'}
        />

        {settings.showHints && showHint && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {settings.showExamples ? verb.example : 
                `The correct form is: ${mode === 'präteritum' ? verb.präteritum : 
                  mode === 'partizipII' ? verb.partizipII : verb.auxiliary}`}
            </AlertDescription>
          </Alert>
        )}

        {status === 'correct' && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-600">
              Correct! Well done!
            </AlertDescription>
          </Alert>
        )}

        {status === 'incorrect' && (
          <Alert className="bg-red-50 border-red-200">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-600">
              Not quite. The correct answer is: {
                mode === 'präteritum' ? verb.präteritum :
                mode === 'partizipII' ? verb.partizipII :
                verb.auxiliary
              }
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2 justify-center">
          {status === 'idle' && (
            <>
              <Button onClick={checkAnswer}>Check</Button>
              {settings.showHints && (
                <Button variant="outline" onClick={() => setShowHint(true)}>
                  <HelpCircle className="h-4 w-4 mr-2" />
                  Hint
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
