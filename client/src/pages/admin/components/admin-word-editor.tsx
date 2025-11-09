import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { Word } from '@shared';

import {
  ADJECTIVE_FIELDS,
  COMMON_FIELDS,
  NOUN_FIELDS,
  PAGE_DEBUG_ID,
  VERB_FIELDS,
  type EditFieldConfig,
} from '../constants';
import { createFormState, preparePayload, type WordFormState } from '../schemas';

interface AdminWordEditorProps {
  word: Word;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (wordId: number, payload: Record<string, unknown>) => void;
  isSubmitting: boolean;
  trigger: ReactNode;
}

export function AdminWordEditor({
  word,
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  trigger,
}: AdminWordEditorProps) {
  const [formState, setFormState] = useState<WordFormState | null>(() => createFormState(word));

  useEffect(() => {
    if (open) {
      setFormState(createFormState(word));
    }
  }, [open, word]);

  const fields = useMemo<EditFieldConfig[]>(() => {
    const base = [...COMMON_FIELDS];

    if (word.pos === 'V') {
      base.push(...VERB_FIELDS);
    }

    if (word.pos === 'N') {
      base.push(...NOUN_FIELDS);
    }

    if (word.pos === 'Adj') {
      base.push(...ADJECTIVE_FIELDS);
    }

    return base;
  }, [word.pos]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState) return;

    const payload = preparePayload(formState, word.pos);
    onSubmit(word.id, payload);
  };

  const updateField = (key: keyof WordFormState, value: string) => {
    setFormState((state) => (state ? { ...state, [key]: value } : state));
  };

  const translations = word.translations ?? [];
  const examples = word.examples ?? [];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent className="max-h-[85vh] overflow-y-auto">
        <DrawerHeader>
          <DrawerTitle>Edit {word.lemma}</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          {fields.map((field) => {
            const value = formState?.[field.key] ?? '';

            if (field.type === 'textarea') {
              return (
                <div key={field.key} className="space-y-2">
                  <Label className="text-sm font-medium">{field.label}</Label>
                  <Textarea value={value} onChange={(event) => updateField(field.key, event.target.value)} />
                </div>
              );
            }

            if (field.type === 'select' && field.options) {
              const fallbackOption =
                field.options.find((option) => option.value === 'unset')?.value ?? field.options[0]?.value ?? '';
              const currentValue = value || fallbackOption;

              return (
                <div key={field.key} className="space-y-2">
                  <Label className="text-sm font-medium">{field.label}</Label>
                  <Select value={currentValue} onValueChange={(next) => updateField(field.key, next)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            }

            return (
              <div key={field.key} className="space-y-2">
                <Label className="text-sm font-medium">{field.label}</Label>
                <Input value={value} onChange={(event) => updateField(field.key, event.target.value)} />
              </div>
            );
          })}

          {(translations.length || examples.length) && (
            <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/40 p-4">
              {translations.length ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Stored translations
                  </div>
                  <ul className="mt-1 space-y-1 text-sm">
                    {translations.map((translation, index) => (
                      <li key={`${translation.value}-${translation.source ?? 'unknown'}-${index}`}>
                        <span className="font-medium">{translation.value}</span>
                        {translation.language ? (
                          <span className="text-muted-foreground"> ({translation.language})</span>
                        ) : null}
                        {translation.source ? (
                          <span className="text-muted-foreground"> · {translation.source}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {examples.length ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Stored examples
                  </div>
                  <ul className="mt-1 space-y-2 text-sm">
                    {examples.map((example, index) => {
                      const sentence = example.sentence ?? example.exampleDe ?? '—';
                      const english = example.translations?.en ?? example.exampleEn ?? null;

                      return (
                        <li key={`${sentence}-${english ?? '—'}-${index}`} className="leading-snug">
                          <span className="font-medium text-foreground">{sentence}</span>
                          {english ? <span className="text-muted-foreground"> · {english}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          )}

          <DrawerFooter>
            <Button
              type="submit"
              disabled={isSubmitting}
              debugId={`${PAGE_DEBUG_ID}-word-${word.id}-save-button`}
              id={`${PAGE_DEBUG_ID}-word-${word.id}-save-button`}
            >
              Save changes
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              debugId={`${PAGE_DEBUG_ID}-word-${word.id}-cancel-button`}
              id={`${PAGE_DEBUG_ID}-word-${word.id}-cancel-button`}
            >
              Cancel
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
