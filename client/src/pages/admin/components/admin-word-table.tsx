import { Sparkles, PenSquare, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import type { Word } from '@shared';

import { ADMIN_PAGE_IDS, PAGE_DEBUG_ID } from '../constants';
import { AdminWordEditor } from './admin-word-editor';

interface PaginationPayload {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

interface AdminWordTableProps {
  words: Word[];
  activePos: Word['pos'] | 'ALL';
  isUnauthorized: boolean;
  isLoading: boolean;
  pagination?: PaginationPayload | null;
  fallbackPage: number;
  fallbackPerPage: number;
  onPageChange: (page: number) => void;
  onToggleApproval: (word: Word) => void;
  selectedWordId: number | null;
  onOpenEditor: (word: Word) => void;
  onCloseEditor: () => void;
  onSubmitWord: (wordId: number, payload: Record<string, unknown>) => void;
  isSubmitting: boolean;
}

export function AdminWordTable({
  words,
  activePos,
  isUnauthorized,
  isLoading,
  pagination,
  fallbackPage,
  fallbackPerPage,
  onPageChange,
  onToggleApproval,
  selectedWordId,
  onOpenEditor,
  onCloseEditor,
  onSubmitWord,
  isSubmitting,
}: AdminWordTableProps) {
  const totalWords = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 0;
  const currentPage = pagination?.page ?? fallbackPage;
  const currentPerPage = pagination?.perPage ?? fallbackPerPage;
  const displayTotalPages = totalPages > 0 ? totalPages : 1;
  const pageStart = totalWords > 0 ? (currentPage - 1) * currentPerPage + 1 : 0;
  const pageEnd = totalWords > 0 ? pageStart + words.length - 1 : 0;

  const columns = (() => {
    const base: Array<{ key: string; label: string }> = [
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

    base.push({ key: 'approval', label: 'Approval' });
    base.push({ key: 'complete', label: 'Complete' });
    base.push({ key: 'actions', label: 'Actions' });

    return base;
  })();

  const disablePrevious = currentPage <= 1 || isLoading;
  const disableNext =
    isLoading || (totalPages > 0 ? currentPage >= totalPages : !totalWords);

  return (
    <div className="space-y-6" id={ADMIN_PAGE_IDS.wordsCard}>
      <div className="rounded-2xl border border-border/60" id={ADMIN_PAGE_IDS.tableContainer}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className="px-2 py-2">
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {words.map((word) => (
              <TableRow key={word.id}>
                <TableCell className="px-2 py-2 font-medium">{word.lemma}</TableCell>
                <TableCell className="px-2 py-2">{word.pos}</TableCell>
                <TableCell className="px-2 py-2">{word.level ?? '—'}</TableCell>
                <TableCell className="px-2 py-2">{word.english ?? '—'}</TableCell>
                {activePos === 'V' ? (
                  <>
                    <TableCell className="px-2 py-2">{word.praeteritum ?? '—'}</TableCell>
                    <TableCell className="px-2 py-2">{word.partizipIi ?? '—'}</TableCell>
                    <TableCell className="px-2 py-2">{word.perfekt ?? '—'}</TableCell>
                    <TableCell className="px-2 py-2">{word.aux ?? '—'}</TableCell>
                  </>
                ) : null}
                {activePos === 'N' ? (
                  <>
                    <TableCell className="px-2 py-2">{word.gender ?? '—'}</TableCell>
                    <TableCell className="px-2 py-2">{word.plural ?? '—'}</TableCell>
                  </>
                ) : null}
                {activePos === 'Adj' ? (
                  <>
                    <TableCell className="px-2 py-2">{word.comparative ?? '—'}</TableCell>
                    <TableCell className="px-2 py-2">{word.superlative ?? '—'}</TableCell>
                  </>
                ) : null}
                {activePos !== 'V' && activePos !== 'N' && activePos !== 'Adj' ? (
                  <>
                    <TableCell className="px-2 py-2">{word.exampleDe ?? '—'}</TableCell>
                    <TableCell className="px-2 py-2">{word.exampleEn ?? '—'}</TableCell>
                  </>
                ) : null}
                <TableCell className="px-2 py-2">
                  <Badge variant={word.approved ? 'default' : 'secondary'}>
                    {word.approved ? 'Approved' : 'Pending'}
                  </Badge>
                </TableCell>
                <TableCell className="px-2 py-2">
                  <Badge variant={word.complete ? 'default' : 'outline'}>
                    {word.complete ? 'Complete' : 'Incomplete'}
                  </Badge>
                </TableCell>
                <TableCell className="flex items-center gap-2 px-2 py-2">
                  <Button
                    size="icon"
                    variant={word.approved ? 'destructive' : 'secondary'}
                    className="rounded-xl"
                    title={word.approved ? 'Revoke approval' : 'Mark as approved'}
                    aria-label={word.approved ? 'Revoke approval' : 'Mark as approved'}
                    onClick={() => onToggleApproval(word)}
                    debugId={`${PAGE_DEBUG_ID}-word-${word.id}-toggle-approval-button`}
                    id={`${PAGE_DEBUG_ID}-word-${word.id}-toggle-approval-button`}
                  >
                    {word.approved ? <Trash2 className="h-4 w-4" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
                  </Button>
                  <AdminWordEditor
                    word={word}
                    open={selectedWordId === word.id}
                    onOpenChange={(nextOpen) => {
                      if (nextOpen) {
                        onOpenEditor(word);
                      } else {
                        onCloseEditor();
                      }
                    }}
                    onSubmit={onSubmitWord}
                    isSubmitting={isSubmitting}
                    trigger={
                      <Button
                        size="icon"
                        variant="secondary"
                        className="rounded-xl"
                        title="Edit entry"
                        aria-label="Edit entry"
                        debugId={`${PAGE_DEBUG_ID}-word-${word.id}-edit-button`}
                        id={`${PAGE_DEBUG_ID}-word-${word.id}-edit-button`}
                        onClick={() => onOpenEditor(word)}
                      >
                        <PenSquare className="h-4 w-4" aria-hidden />
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
            {isUnauthorized && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                  Enter the admin token to load words.
                </TableCell>
              </TableRow>
            )}
            {!isUnauthorized && !words.length && !isLoading && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                  No words match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" id={ADMIN_PAGE_IDS.pagination}>
        <div className="text-sm text-muted-foreground">
          {totalWords ? `Showing ${pageStart}–${pageEnd} of ${totalWords} words` : 'No words to display'}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={disablePrevious}
            className="rounded-2xl"
            debugId={`${PAGE_DEBUG_ID}-pagination-previous-button`}
            id={`${PAGE_DEBUG_ID}-pagination-previous-button`}
          >
            Previous
          </Button>
          <div className="text-sm text-muted-foreground">Page {currentPage} of {displayTotalPages}</div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={disableNext}
            className="rounded-2xl"
            debugId={`${PAGE_DEBUG_ID}-pagination-next-button`}
            id={`${PAGE_DEBUG_ID}-pagination-next-button`}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
