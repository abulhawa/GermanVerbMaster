import { useEffect, useMemo, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Link } from 'wouter';

import { AppShell } from '@/components/layout/app-shell';
import { SidebarNavButton } from '@/components/layout/sidebar-nav-button';
import { MobileNavBar } from '@/components/layout/mobile-nav-bar';
import { getPrimaryNavigationItems } from '@/components/layout/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuthSession } from '@/auth/session';
import type { Word } from '@shared';

import {
  ADMIN_PAGE_IDS,
  PAGE_DEBUG_ID,
  type AdminWordFilters as AdminWordFiltersState,
  type ApprovalFilter,
  type CompleteFilter,
} from './admin/constants';
import { AdminWordFilters } from './admin/components/admin-word-filters';
import { AdminWordTable } from './admin/components/admin-word-table';
import { useAdminWordsQuery } from './admin/hooks/use-admin-words-query';
import { useUpdateWordMutation } from './admin/hooks/use-update-word-mutation';

const AdminWordsPage = () => {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('gvm-admin-token') ?? '');
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState<Word['pos'] | 'ALL'>('ALL');
  const [level, setLevel] = useState<string>('All');
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('all');
  const [completeFilter, setCompleteFilter] = useState<CompleteFilter>('all');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(50);
  const [selectedWordId, setSelectedWordId] = useState<number | null>(null);

  const { toast } = useToast();

  const normalizedAdminToken = adminToken.trim();

  useEffect(() => {
    localStorage.setItem('gvm-admin-token', normalizedAdminToken);
  }, [normalizedAdminToken]);

  useEffect(() => {
    setPage(1);
  }, [search, pos, level, approvalFilter, completeFilter]);

  const filters = useMemo<AdminWordFiltersState>(
    () => ({
      search,
      pos,
      level,
      approvalFilter,
      completeFilter,
      page,
      perPage,
    }),
    [search, pos, level, approvalFilter, completeFilter, page, perPage],
  );

  const wordsQuery = useAdminWordsQuery({ token: normalizedAdminToken, filters });

  const updateMutation = useUpdateWordMutation({
    token: normalizedAdminToken,
    invalidateKey: wordsQuery.queryKey,
    onSuccess: () => {
      toast({ title: 'Word updated' });
    },
    onError: (error) => {
      toast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    },
  });

  const words = wordsQuery.data?.data ?? [];
  const pagination = wordsQuery.data?.pagination ?? null;

  const isUnauthorized =
    wordsQuery.isError &&
    wordsQuery.error instanceof Error &&
    wordsQuery.error.message.includes('(401)');

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
  };

  const handleOpenEditor = (word: Word) => {
    setSelectedWordId(word.id);
  };

  const handleCloseEditor = () => {
    setSelectedWordId(null);
  };

  const handleSubmitWord = (wordId: number, payload: Record<string, unknown>) => {
    updateMutation.mutate({ id: wordId, payload });
    setSelectedWordId(null);
  };

  const { data: authSession } = useAuthSession();
  const navigationItems = useMemo(
    () => getPrimaryNavigationItems(authSession?.user.role ?? null),
    [authSession?.user.role],
  );

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

  return (
    <div id={ADMIN_PAGE_IDS.page}>
      <AppShell sidebar={sidebar} mobileNav={<MobileNavBar items={navigationItems} />}>
        <div className="space-y-6" id={ADMIN_PAGE_IDS.content}>
          <section
            className="space-y-4 rounded-3xl border border-border/60 bg-card/85 p-6 shadow-soft shadow-primary/5"
            id={ADMIN_PAGE_IDS.headerSection}
          >
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Admin console</p>
              <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
                <Settings2 className="h-6 w-6 text-primary" aria-hidden />
                Lexicon management
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Curate the verb bank, manage metadata, and keep entries aligned across CEFR levels.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
              <Link href="/">
                <Button
                  variant="secondary"
                  className="rounded-2xl px-5"
                  debugId={`${PAGE_DEBUG_ID}-topbar-back-button`}
                  id={`${PAGE_DEBUG_ID}-topbar-back-button`}
                >
                  Back to practice
                </Button>
              </Link>
              <Link href="/analytics">
                <Button
                  className="rounded-2xl px-5"
                  debugId={`${PAGE_DEBUG_ID}-topbar-analytics-button`}
                  id={`${PAGE_DEBUG_ID}-topbar-analytics-button`}
                >
                  Open analytics
                </Button>
              </Link>
            </div>
          </section>
          <Card
            className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5"
            id={ADMIN_PAGE_IDS.filterCard}
          >
            <CardHeader className="space-y-2">
              <CardTitle>Admin: Words</CardTitle>
              <CardDescription>
                Review and edit the aggregated lexicon. Filters update the API query in real time.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <AdminWordFilters
                adminToken={adminToken}
                search={search}
                pos={pos}
                level={level}
                approvalFilter={approvalFilter}
                completeFilter={completeFilter}
                perPage={perPage}
                onAdminTokenChange={setAdminToken}
                onSearchChange={setSearch}
                onPosChange={setPos}
                onLevelChange={setLevel}
                onApprovalFilterChange={setApprovalFilter}
                onCompleteFilterChange={setCompleteFilter}
                onPerPageChange={(value) => {
                  setPerPage(value);
                  setPage(1);
                }}
              />
              <AdminWordTable
                words={words}
                activePos={pos}
                isUnauthorized={isUnauthorized}
                isLoading={wordsQuery.isLoading}
                pagination={pagination}
                fallbackPage={page}
                fallbackPerPage={perPage}
                onPageChange={handlePageChange}
                onToggleApproval={(word) => updateMutation.mutate({ id: word.id, payload: { approved: !word.approved } })}
                selectedWordId={selectedWordId}
                onOpenEditor={handleOpenEditor}
                onCloseEditor={handleCloseEditor}
                onSubmitWord={handleSubmitWord}
                isSubmitting={updateMutation.isPending}
              />
            </CardContent>
          </Card>
        </div>
      </AppShell>
    </div>
  );
};

export default AdminWordsPage;
