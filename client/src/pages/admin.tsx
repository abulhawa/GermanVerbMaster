import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { Word } from '@shared';

const wordSchema = z.object({
  id: z.number(),
  lemma: z.string(),
  pos: z.enum(['V', 'N', 'Adj', 'Adv', 'Pron', 'Det', 'Präp', 'Konj', 'Num', 'Part', 'Interj']),
  level: z.string().nullable(),
  english: z.string().nullable(),
  exampleDe: z.string().nullable(),
  exampleEn: z.string().nullable(),
  gender: z.string().nullable(),
  plural: z.string().nullable(),
  separable: z.boolean().nullable(),
  aux: z.enum(['haben', 'sein']).nullable(),
  praesensIch: z.string().nullable(),
  praesensEr: z.string().nullable(),
  praeteritum: z.string().nullable(),
  partizipIi: z.string().nullable(),
  perfekt: z.string().nullable(),
  comparative: z.string().nullable(),
  superlative: z.string().nullable(),
  canonical: z.boolean(),
  complete: z.boolean(),
  sourcesCsv: z.string().nullable(),
  sourceNotes: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const wordsResponseSchema = z.array(wordSchema);

type CanonicalFilter = 'all' | 'only' | 'non';
type CompleteFilter = 'all' | 'complete' | 'incomplete';

const POS_OPTIONS: Array<{ label: string; value: Word['pos'] | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Verbs', value: 'V' },
  { label: 'Nouns', value: 'N' },
  { label: 'Adjectives', value: 'Adj' },
  { label: 'Adverbs', value: 'Adv' },
  { label: 'Pronouns', value: 'Pron' },
  { label: 'Determiners', value: 'Det' },
  { label: 'Prepositions', value: 'Präp' },
  { label: 'Conjunctions', value: 'Konj' },
  { label: 'Numbers', value: 'Num' },
  { label: 'Particles', value: 'Part' },
  { label: 'Interjections', value: 'Interj' },
];

const LEVEL_OPTIONS = ['All', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

const canonicalOptions: Array<{ label: string; value: CanonicalFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Canonical only', value: 'only' },
  { label: 'Non-canonical', value: 'non' },
];

const completeOptions: Array<{ label: string; value: CompleteFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Complete', value: 'complete' },
  { label: 'Incomplete', value: 'incomplete' },
];

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
    | 'superlative'
    | 'sourcesCsv'
    | 'sourceNotes';
  label: string;
  type?: 'text' | 'textarea' | 'select' | 'boolean';
  options?: Array<{ label: string; value: string }>;
}

const commonFields: EditFieldConfig[] = [
  { key: 'level', label: 'Level' },
  { key: 'english', label: 'English' },
  { key: 'exampleDe', label: 'Example (DE)', type: 'textarea' },
  { key: 'exampleEn', label: 'Example (EN)', type: 'textarea' },
  { key: 'sourcesCsv', label: 'Sources' },
  { key: 'sourceNotes', label: 'Source notes', type: 'textarea' },
];

const verbFields: EditFieldConfig[] = [
  { key: 'aux', label: 'Auxiliary', type: 'select', options: [
    { label: 'Unset', value: 'unset' },
    { label: 'haben', value: 'haben' },
    { label: 'sein', value: 'sein' },
  ] },
  { key: 'separable', label: 'Separable', type: 'select', options: [
    { label: 'Unset', value: 'unset' },
    { label: 'Yes', value: 'true' },
    { label: 'No', value: 'false' },
  ] },
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

const wordFormSchema = z.object({
  level: z.string(),
  english: z.string(),
  exampleDe: z.string(),
  exampleEn: z.string(),
  gender: z.string(),
  plural: z.string(),
  separable: z.string(),
  aux: z.string(),
  praesensIch: z.string(),
  praesensEr: z.string(),
  praeteritum: z.string(),
  partizipIi: z.string(),
  perfekt: z.string(),
  comparative: z.string(),
  superlative: z.string(),
  sourcesCsv: z.string(),
  sourceNotes: z.string(),
});

type WordFormState = z.infer<typeof wordFormSchema>;

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
    sourcesCsv: word.sourcesCsv ?? '',
    sourceNotes: word.sourceNotes ?? '',
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
  assignText('sourcesCsv', 'sourcesCsv');
  assignText('sourceNotes', 'sourceNotes');

  if (pos === 'V') {
    if (form.aux === 'unset') {
      payload.aux = null;
    } else if (form.aux === 'haben' || form.aux === 'sein') {
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

const AdminWordsPage = () => {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('gvm-admin-token') ?? '');
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState<Word['pos'] | 'ALL'>('ALL');
  const [level, setLevel] = useState<string>('All');
  const [canonicalFilter, setCanonicalFilter] = useState<CanonicalFilter>('all');
  const [completeFilter, setCompleteFilter] = useState<CompleteFilter>('all');
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [formState, setFormState] = useState<WordFormState | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const normalizedAdminToken = adminToken.trim();

  useEffect(() => {
    localStorage.setItem('gvm-admin-token', normalizedAdminToken);
  }, [normalizedAdminToken]);

  const filters = useMemo(
    () => ({ search, pos, level, canonicalFilter, completeFilter }),
    [search, pos, level, canonicalFilter, completeFilter],
  );

  const queryKey = useMemo(
    () => ['words', filters],
    [filters],
  );

  const hasAdminToken = Boolean(normalizedAdminToken);

  const wordsQuery = useQuery({
    queryKey,
    enabled: hasAdminToken,
    queryFn: async () => {
      const params = new URLSearchParams({ admin: '1' });
      if (filters.pos !== 'ALL') params.set('pos', filters.pos);
      if (filters.level !== 'All') params.set('level', filters.level);
      if (filters.search.trim()) params.set('search', filters.search.trim());
      if (filters.canonicalFilter === 'only') params.set('canonical', 'only');
      if (filters.canonicalFilter === 'non') params.set('canonical', 'non');
      if (filters.completeFilter === 'complete') params.set('complete', 'only');
      if (filters.completeFilter === 'incomplete') params.set('complete', 'non');

      const response = await fetch(`/api/words?${params.toString()}`, {
        headers: {
          'x-admin-token': normalizedAdminToken,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load words (${response.status})`);
      }

      const payload = await response.json();
      const parsed = wordsResponseSchema.parse(payload);
      return parsed;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) => {
      const response = await fetch(`/api/words/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': normalizedAdminToken,
        },
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
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Word updated' });
    },
    onError: (error) => {
      toast({ title: 'Update failed', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    },
  });

  const openEditor = (word: Word) => {
    setSelectedWord(word);
    setFormState(createFormState(word));
  };

  const closeEditor = () => {
    setSelectedWord(null);
    setFormState(null);
  };

  const submitForm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedWord || !formState) return;

    const payload = preparePayload(formState, selectedWord.pos);
    updateMutation.mutate({ id: selectedWord.id, payload });
    closeEditor();
  };

  const toggleCanonical = (word: Word) => {
    updateMutation.mutate({ id: word.id, payload: { canonical: !word.canonical } });
  };

  const words = wordsQuery.data ?? [];
  const activePos = pos;

  const columns = useMemo(() => {
    const base = [
      { key: 'lemma', label: 'Lemma' },
      { key: 'pos', label: 'POS' },
      { key: 'level', label: 'Level' },
      { key: 'english', label: 'English' },
    ];

    if (activePos === 'V') {
      base.push(
        { key: 'praeteritum', label: 'Präteritum' },
        { key: 'partizipIi', label: 'Partizip II' },
        { key: 'perfekt', label: 'Perfekt' },
        { key: 'aux', label: 'Aux' },
      );
    } else if (activePos === 'N') {
      base.push(
        { key: 'gender', label: 'Gender' },
        { key: 'plural', label: 'Plural' },
      );
    } else if (activePos === 'Adj') {
      base.push(
        { key: 'comparative', label: 'Comparative' },
        { key: 'superlative', label: 'Superlative' },
      );
    } else {
      base.push(
        { key: 'exampleDe', label: 'Example (DE)' },
        { key: 'exampleEn', label: 'Example (EN)' },
      );
    }

    base.push({ key: 'canonical', label: 'Canonical' });
    base.push({ key: 'complete', label: 'Complete' });
    base.push({ key: 'actions', label: 'Actions' });

    return base;
  }, [activePos]);

  return (
    <div className="container mx-auto space-y-6 py-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin: Words</CardTitle>
          <CardDescription>Review and edit the aggregated lexicon. Filters update the API query in real time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="admin-token">Admin token</Label>
              <Input
                id="admin-token"
                type="password"
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
                placeholder="Enter x-admin-token"
              />
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by lemma or English"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <Label>Part of speech</Label>
              <Select value={pos} onValueChange={(value) => setPos(value as Word['pos'] | 'ALL')}>
                <SelectTrigger>
                  <SelectValue placeholder="POS" />
                </SelectTrigger>
                <SelectContent>
                  {POS_OPTIONS.map((option) => (
                    <SelectItem key={option.value || 'all'} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Level</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  {LEVEL_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Canonical</Label>
              <Select value={canonicalFilter} onValueChange={(value: CanonicalFilter) => setCanonicalFilter(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Canonical" />
                </SelectTrigger>
                <SelectContent>
                  {canonicalOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Completeness</Label>
              <Select value={completeFilter} onValueChange={(value: CompleteFilter) => setCompleteFilter(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Completeness" />
                </SelectTrigger>
                <SelectContent>
                  {completeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Words</CardTitle>
          <CardDescription>
            {!hasAdminToken && 'Enter the admin token to load words.'}
            {hasAdminToken && wordsQuery.isLoading && 'Loading words…'}
            {hasAdminToken && wordsQuery.isError && 'Failed to load words. Check the token and try again.'}
            {hasAdminToken && wordsQuery.isSuccess && `${words.length} word${words.length === 1 ? '' : 's'} found.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {words.map((word) => (
                <TableRow key={word.id}>
                  <TableCell className="font-medium">{word.lemma}</TableCell>
                  <TableCell>{word.pos}</TableCell>
                  <TableCell>{word.level ?? '—'}</TableCell>
                  <TableCell>{word.english ?? '—'}</TableCell>
                  {activePos === 'V' && (
                    <>
                      <TableCell>{word.praeteritum ?? '—'}</TableCell>
                      <TableCell>{word.partizipIi ?? '—'}</TableCell>
                      <TableCell>{word.perfekt ?? '—'}</TableCell>
                      <TableCell>{word.aux ?? '—'}</TableCell>
                    </>
                  )}
                  {activePos === 'N' && (
                    <>
                      <TableCell>{word.gender ?? '—'}</TableCell>
                      <TableCell>{word.plural ?? '—'}</TableCell>
                    </>
                  )}
                  {activePos === 'Adj' && (
                    <>
                      <TableCell>{word.comparative ?? '—'}</TableCell>
                      <TableCell>{word.superlative ?? '—'}</TableCell>
                    </>
                  )}
                  {activePos === 'ALL' && (
                    <>
                      <TableCell>{word.exampleDe ?? '—'}</TableCell>
                      <TableCell>{word.exampleEn ?? '—'}</TableCell>
                    </>
                  )}
                  <TableCell>
                    <Badge variant={word.canonical ? 'default' : 'secondary'}>
                      {word.canonical ? 'Canonical' : 'Shadow'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={word.complete ? 'default' : 'outline'}>
                      {word.complete ? 'Complete' : 'Incomplete'}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2">
                    <Button
                      size="sm"
                      variant={word.canonical ? 'outline' : 'secondary'}
                      onClick={() => toggleCanonical(word)}
                    >
                      {word.canonical ? 'Unset canonical' : 'Set canonical'}
                    </Button>
                    <Drawer open={selectedWord?.id === word.id} onOpenChange={(open) => {
                      if (open) {
                        openEditor(word);
                      } else {
                        closeEditor();
                      }
                    }}>
                      <DrawerTrigger asChild>
                        <Button size="sm" variant="outline" onClick={() => openEditor(word)}>
                          Edit
                        </Button>
                      </DrawerTrigger>
                      <DrawerContent>
                        <DrawerHeader>
                          <DrawerTitle>Edit {word.lemma}</DrawerTitle>
                        </DrawerHeader>
                        <form onSubmit={submitForm} className="space-y-4 p-4">
                          {[...commonFields,
                            ...(word.pos === 'V' ? verbFields : []),
                            ...(word.pos === 'N' ? nounFields : []),
                            ...(word.pos === 'Adj' ? adjectiveFields : []),
                          ].map((field) => (
                            <div key={field.key} className="space-y-2">
                              <Label className="text-sm font-medium">{field.label}</Label>
                                {field.type === 'textarea' ? (
                                  <Textarea
                                    value={formState?.[field.key] ?? ''}
                                    onChange={(event) =>
                                      setFormState((state) =>
                                        state ? { ...state, [field.key]: event.target.value } : state,
                                      )
                                    }
                                  />
                                ) : field.type === 'select' && field.options ? (
                                  (() => {
                                    const fallbackOption =
                                      field.options.find((option) => option.value === 'unset')?.value ??
                                      field.options[0]?.value ??
                                      '';
                                    const currentValue = formState?.[field.key] ?? fallbackOption;
                                    return (
                                      <Select
                                        value={currentValue}
                                        onValueChange={(value) =>
                                          setFormState((state) =>
                                            state ? { ...state, [field.key]: value } : state,
                                          )
                                        }
                                      >
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
                                    );
                                  })()
                                ) : (
                                  <Input
                                    value={formState?.[field.key] ?? ''}
                                    onChange={(event) =>
                                      setFormState((state) =>
                                      state ? { ...state, [field.key]: event.target.value } : state,
                                    )
                                  }
                                />
                              )}
                            </div>
                          ))}
                          <DrawerFooter>
                            <Button type="submit" disabled={updateMutation.isPending}>
                              Save changes
                            </Button>
                            <Button type="button" variant="outline" onClick={closeEditor}>
                              Cancel
                            </Button>
                          </DrawerFooter>
                        </form>
                      </DrawerContent>
                    </Drawer>
                  </TableCell>
                </TableRow>
              ))}
              {!hasAdminToken && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                    Enter the admin token to load words.
                  </TableCell>
                </TableRow>
              )}
              {hasAdminToken && !words.length && !wordsQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                    No words match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminWordsPage;
