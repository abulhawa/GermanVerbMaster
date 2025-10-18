import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Link, useLocation, useRoute } from 'wouter';

import { AppShell } from '@/components/layout/app-shell';
import { MobileNavBar } from '@/components/layout/mobile-nav-bar';
import { SidebarNavButton } from '@/components/layout/sidebar-nav-button';
import { getPrimaryNavigationItems } from '@/components/layout/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { Word } from '@shared';
import { wordSchema } from './admin-word-schemas';

interface EditFieldConfig {
  key:
    | 'level'
    | 'english'
    | 'exampleDe'
    | 'exampleEn'
    | 'gender'
    | 'plural'
    | 'separable'
    | 'aux'
    | 'praesensIch'
    | 'praesensEr'
    | 'praeteritum'
    | 'partizipIi'
    | 'perfekt'
    | 'comparative'
    | 'superlative';
  label: string;
  type?: 'text' | 'textarea' | 'select';
  options?: Array<{ label: string; value: string }>;
}

const commonFields: EditFieldConfig[] = [
  { key: 'level', label: 'Level' },
  { key: 'english', label: 'English' },
  { key: 'exampleDe', label: 'Example (DE)', type: 'textarea' },
  { key: 'exampleEn', label: 'Example (EN)', type: 'textarea' },
];

const verbFields: EditFieldConfig[] = [
  {
    key: 'aux',
    label: 'Auxiliary',
    type: 'select',
    options: [
      { label: 'Unset', value: 'unset' },
      { label: 'haben', value: 'haben' },
      { label: 'sein', value: 'sein' },
      { label: 'haben / sein', value: 'haben / sein' },
    ],
  },
  {
    key: 'separable',
    label: 'Separable',
    type: 'select',
    options: [
      { label: 'Unset', value: 'unset' },
      { label: 'Yes', value: 'true' },
      { label: 'No', value: 'false' },
    ],
  },
  { key: 'praesensIch', label: 'Präsens (ich)' },
  { key: 'praesensEr', label: 'Präsens (er/sie/es)' },
  { key: 'praeteritum', label: 'Präteritum' },
  { key: 'partizipIi', label: 'Partizip II' },
  { key: 'perfekt', label: 'Perfekt' },
];

const nounFields: EditFieldConfig[] = [
  { key: 'gender', label: 'Gender / Artikel' },
  { key: 'plural', label: 'Plural' },
];

const adjectiveFields: EditFieldConfig[] = [
  { key: 'comparative', label: 'Comparative' },
  { key: 'superlative', label: 'Superlative' },
];

interface WordFormState {
  level: string;
  english: string;
  exampleDe: string;
  exampleEn: string;
  gender: string;
  plural: string;
  separable: string;
  aux: string;
  praesensIch: string;
  praesensEr: string;
  praeteritum: string;
  partizipIi: string;
  perfekt: string;
  comparative: string;
  superlative: string;
}

function createFormState(word: Word): WordFormState {
  return {
    level: word.level ?? '',
    english: word.english ?? '',
    exampleDe: word.exampleDe ?? '',
    exampleEn: word.exampleEn ?? '',
    gender: word.gender ?? '',
    plural: word.plural ?? '',
    separable: word.separable === null ? 'unset' : word.separable ? 'true' : 'false',
    aux: word.aux ?? 'unset',
    praesensIch: word.praesensIch ?? '',
    praesensEr: word.praesensEr ?? '',
    praeteritum: word.praeteritum ?? '',
    partizipIi: word.partizipIi ?? '',
    perfekt: word.perfekt ?? '',
    comparative: word.comparative ?? '',
    superlative: word.superlative ?? '',
  };
}

function preparePayload(form: WordFormState, pos: Word['pos']) {
  const payload: Record<string, unknown> = {};

  const assignText = (key: keyof WordFormState, column: keyof Word) => {
    const raw = form[key].trim();
    payload[column] = raw.length ? raw : null;
  };

  assignText('level', 'level');
  assignText('english', 'english');
  assignText('exampleDe', 'exampleDe');
  assignText('exampleEn', 'exampleEn');

  if (pos === 'V') {
    if (form.aux === 'unset') {
      payload.aux = null;
    } else if (form.aux === 'haben' || form.aux === 'sein' || form.aux === 'haben / sein') {
      payload.aux = form.aux;
    }

    if (form.separable === 'unset') {
      payload.separable = null;
    } else if (form.separable === 'true') {
      payload.separable = true;
    } else if (form.separable === 'false') {
      payload.separable = false;
    }

    assignText('praesensIch', 'praesensIch');
    assignText('praesensEr', 'praesensEr');
    assignText('praeteritum', 'praeteritum');
    assignText('partizipIi', 'partizipIi');
    assignText('perfekt', 'perfekt');
  }

  if (pos === 'N') {
    assignText('gender', 'gender');
    assignText('plural', 'plural');
  }

  if (pos === 'Adj') {
    assignText('comparative', 'comparative');
    assignText('superlative', 'superlative');
  }

  return payload;
}

function humanizePos(pos: Word['pos']) {
  const mapping: Record<Word['pos'], string> = {
    V: 'Verb',
    N: 'Noun',
    Adj: 'Adjective',
    Adv: 'Adverb',
    Pron: 'Pronoun',
    Det: 'Determiner',
    Präp: 'Preposition',
    Konj: 'Conjunction',
    Num: 'Number',
    Part: 'Particle',
    Interj: 'Interjection',
  };
  return mapping[pos] ?? pos;
}

const AdminWordEditPage = () => {
  const [match, params] = useRoute('/admin/words/:id');
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const wordId = match ? Number.parseInt(params?.id ?? '', 10) : NaN;
  const isValidId = Number.isFinite(wordId) && wordId > 0;

  const [formState, setFormState] = useState<WordFormState | null>(null);

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate('/admin');
    }
  }, [navigate]);

  const wordQuery = useQuery({
    queryKey: ['word', wordId],
    enabled: isValidId,
    queryFn: async () => {
      const response = await fetch(`/api/words/${wordId}`);
      if (!response.ok) {
        const error = new Error(`Failed to load word (${response.status})`);
        (error as Error & { status?: number }).status = response.status;
        throw error;
      }
      const payload = await response.json();
      return wordSchema.parse(payload);
    },
  });

  useEffect(() => {
    if (wordQuery.data) {
      setFormState(createFormState(wordQuery.data));
    }
  }, [wordQuery.data]);

  const updateMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const response = await fetch(`/api/words/${wordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to update word');
      }

      const result = await response.json();
      return wordSchema.parse(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['words'] });
      queryClient.invalidateQueries({ queryKey: ['export-status'] });
      queryClient.invalidateQueries({ queryKey: ['word', wordId] });
      toast({ title: 'Word updated' });
      goBack();
    },
    onError: (error) => {
      toast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState || !wordQuery.data) return;
    const payload = preparePayload(formState, wordQuery.data.pos);
    updateMutation.mutate(payload);
  };

  const handleCancel = () => {
    goBack();
  };

  const updateField = (key: keyof WordFormState, value: string) => {
    setFormState((current) => (current ? { ...current, [key]: value } : current));
  };

  const formFields = useMemo(() => {
    if (!wordQuery.data) {
      return commonFields;
    }

    const extraFields =
      wordQuery.data.pos === 'V'
        ? verbFields
        : wordQuery.data.pos === 'N'
        ? nounFields
        : wordQuery.data.pos === 'Adj'
        ? adjectiveFields
        : [];

    return [...commonFields, ...extraFields];
  }, [wordQuery.data]);

  const renderContent = () => {
    if (!match || !isValidId) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Word not found</CardTitle>
            <CardDescription>
              The requested word id is invalid. Return to the admin console to continue editing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={goBack}>Return to admin</Button>
          </CardContent>
        </Card>
      );
    }

    if (wordQuery.isLoading || !formState || !wordQuery.data) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Loading word…</CardTitle>
            <CardDescription>Please wait while the entry is being retrieved.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-32 animate-pulse rounded-2xl bg-muted" />
          </CardContent>
        </Card>
      );
    }

    if (wordQuery.isError) {
      const errorMessage =
        wordQuery.error instanceof Error ? wordQuery.error.message : 'Failed to load the selected word.';
      return (
        <Card>
          <CardHeader>
            <CardTitle>Failed to load word</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={goBack}>Return to admin</Button>
          </CardContent>
        </Card>
      );
    }

    const word = wordQuery.data;
    const posLabel = humanizePos(word.pos);

    return (
      <Card className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-2xl font-semibold">Edit {word.lemma}</CardTitle>
            <CardDescription>
              Update lexical information for this {posLabel.toLowerCase()} and save changes directly to the database.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{posLabel}</Badge>
            <Badge variant="outline">ID {word.id}</Badge>
            <Badge variant={word.approved ? 'default' : 'secondary'}>
              {word.approved ? 'Approved' : 'Pending approval'}
            </Badge>
            {word.complete ? <Badge variant="default">Complete</Badge> : <Badge variant="outline">Incomplete</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              {formFields.map((field) => {
                const value = formState[field.key];
                if (field.type === 'textarea') {
                  return (
                    <div key={field.key} className="space-y-2 md:col-span-2">
                      <Label className="text-sm font-medium">{field.label}</Label>
                      <Textarea value={value} onChange={(event) => updateField(field.key, event.target.value)} />
                    </div>
                  );
                }

                if (field.type === 'select' && field.options) {
                  const fallbackOption = field.options[0]?.value ?? '';
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
            </div>

            {(word.translations?.length ?? 0) || (word.examples?.length ?? 0) ? (
              <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/40 p-4">
                {word.translations?.length ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Stored translations
                    </div>
                    <ul className="mt-1 space-y-1 text-sm">
                      {word.translations.map((translation, index) => (
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
                {word.examples?.length ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Stored examples
                    </div>
                    <ul className="mt-1 space-y-2 text-sm">
                      {word.examples.map((example, index) => {
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
            ) : word.enrichmentAppliedAt ? (
              <p className="text-sm text-muted-foreground">No stored translations or examples recorded yet.</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={updateMutation.isPending}>
                Save changes
              </Button>
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate(`/admin/enrichment?word=${word.id}`)}
                className="ml-auto"
              >
                <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                Open enrichment tools
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  };

  const navigationItems = useMemo(() => getPrimaryNavigationItems(), []);

  const sidebar = (
    <div className="flex h-full flex-col justify-between gap-8">
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="grid gap-2">
            {navigationItems.map((item) => (
              <SidebarNavButton
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                exact={item.exact}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const headerSubtitle = wordQuery.data?.lemma
    ? `Editing “${wordQuery.data.lemma}” (ID ${wordQuery.data.id})`
    : 'Load a word to edit its details.';

  return (
    <AppShell sidebar={sidebar} mobileNav={<MobileNavBar items={navigationItems} />}>
      <div className="space-y-6">
        <section className="space-y-4 rounded-3xl border border-border/60 bg-card/85 p-6 shadow-soft shadow-primary/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Admin console</p>
              <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
                <ArrowLeft className="h-6 w-6 text-primary" aria-hidden />
                Edit word
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">{headerSubtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" className="rounded-2xl px-5" onClick={goBack}>
                Back to list
              </Button>
              <Button variant="ghost" className="rounded-2xl px-5" asChild>
                <Link href="/admin/enrichment">Open enrichment console</Link>
              </Button>
            </div>
          </div>
        </section>
        {renderContent()}
      </div>
    </AppShell>
  );
};

export default AdminWordEditPage;
