import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { Word } from '@shared';

import {
  ADJECTIVE_FIELDS,
  COMMON_FIELDS,
  NOUN_FIELDS,
  PAGE_DEBUG_ID,
  POS_OPTIONS,
  VERB_FIELDS,
  type EditFieldConfig,
} from '../constants';
import { createEmptyWordFormState, prepareCreatePayload, type CreateWordFormState } from '../schemas';

interface AdminWordCreatorProps {
  onSubmit: (
    payload: Record<string, unknown>,
    options: { enrichAfterCreate: boolean },
  ) => Promise<void>;
  isSubmitting: boolean;
}

const CREATE_POS_OPTIONS = POS_OPTIONS.filter((option) => option.value !== 'ALL');

export function AdminWordCreator({ onSubmit, isSubmitting }: AdminWordCreatorProps) {
  const [open, setOpen] = useState(false);
  const [formState, setFormState] = useState<CreateWordFormState>(() => createEmptyWordFormState());
  const [enrichAfterCreate, setEnrichAfterCreate] = useState(true);

  const fields = useMemo<EditFieldConfig[]>(() => {
    const base = [...COMMON_FIELDS];

    if (formState.pos === 'V') {
      base.push(...VERB_FIELDS);
    }

    if (formState.pos === 'N') {
      base.push(...NOUN_FIELDS);
    }

    if (formState.pos === 'Adj') {
      base.push(...ADJECTIVE_FIELDS);
    }

    return base;
  }, [formState.pos]);

  const updateField = <K extends keyof CreateWordFormState>(key: K, value: CreateWordFormState[K]) => {
    setFormState((state) => ({ ...state, [key]: value }));
  };

  const resetState = () => {
    setFormState(createEmptyWordFormState(formState.pos));
    setEnrichAfterCreate(true);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetState();
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await onSubmit(prepareCreatePayload(formState), { enrichAfterCreate });
      handleOpenChange(false);
    } catch {
      // The page-level mutation handlers surface the error via toast.
    }
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <Button className="rounded-2xl" type="button">
          Add word
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[88vh] overflow-y-auto">
        <DrawerHeader>
          <DrawerTitle>Add lexicon entry</DrawerTitle>
          <DrawerDescription>
            Create a manual admin entry in Supabase and optionally fill missing fields with Groq after saving.
          </DrawerDescription>
        </DrawerHeader>
        <form className="space-y-4 p-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${PAGE_DEBUG_ID}-create-lemma`}>Lemma</Label>
              <Input
                id={`${PAGE_DEBUG_ID}-create-lemma`}
                value={formState.lemma}
                onChange={(event) => updateField('lemma', event.target.value)}
                placeholder="e.g. tanzen"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${PAGE_DEBUG_ID}-create-pos`}>Part of speech</Label>
              <Select
                value={formState.pos}
                onValueChange={(value) => updateField('pos', value as Word['pos'])}
              >
                <SelectTrigger id={`${PAGE_DEBUG_ID}-create-pos`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREATE_POS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {fields.map((field) => {
            const value = formState[field.key] ?? '';
            const inputId = `${PAGE_DEBUG_ID}-create-${field.key}`;

            if (field.type === 'textarea') {
              return (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={inputId}>{field.label}</Label>
                  <Textarea
                    id={inputId}
                    value={value}
                    onChange={(event) => updateField(field.key, event.target.value)}
                  />
                </div>
              );
            }

            if (field.type === 'select' && field.options) {
              const fallbackOption =
                field.options.find((option) => option.value === 'unset')?.value ?? field.options[0]?.value ?? '';
              const currentValue = value || fallbackOption;

              return (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={inputId}>{field.label}</Label>
                  <Select value={currentValue} onValueChange={(next) => updateField(field.key, next)}>
                    <SelectTrigger id={inputId}>
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
                <Label htmlFor={inputId}>{field.label}</Label>
                <Input
                  id={inputId}
                  value={value}
                  onChange={(event) => updateField(field.key, event.target.value)}
                />
              </div>
            );
          })}

          <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/40 px-4 py-3">
            <div className="space-y-1">
              <Label htmlFor={`${PAGE_DEBUG_ID}-create-enrich`} className="text-sm font-medium">
                Enrich with Groq after create
              </Label>
              <p className="text-xs text-muted-foreground">
                Fills missing translations, examples, and core grammar fields without overwriting what you entered.
              </p>
            </div>
            <Switch
              id={`${PAGE_DEBUG_ID}-create-enrich`}
              checked={enrichAfterCreate}
              onCheckedChange={setEnrichAfterCreate}
            />
          </div>

          <DrawerFooter>
            <Button type="submit" disabled={isSubmitting}>
              Save word
            </Button>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
