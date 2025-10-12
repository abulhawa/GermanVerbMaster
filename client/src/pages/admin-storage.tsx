import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Cloud, Folder, FileText, UploadCloud, RefreshCcw, ArrowLeft, Loader2 } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { SidebarNavButton } from '@/components/layout/sidebar-nav-button';
import { MobileNavBar } from '@/components/layout/mobile-nav-bar';
import { getPrimaryNavigationItems } from '@/components/layout/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuthSession } from '@/auth/session';
import type {
  SupabaseStorageListResponse,
  SupabaseStorageObjectSummary,
  WordsBackupSummary,
} from '@shared/enrichment';
import { cleanAndExportEnrichmentStorage, fetchEnrichmentStorage } from '@/lib/admin-storage';

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
}

function formatFileSize(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function buildBreadcrumbs(path: string | null | undefined): Array<{ label: string; path: string }> {
  if (!path) {
    return [];
  }
  const segments = path.split('/').filter((segment) => segment.length > 0);
  const breadcrumbs: Array<{ label: string; path: string }> = [];
  segments.forEach((segment, index) => {
    const target = segments.slice(0, index + 1).join('/');
    breadcrumbs.push({ label: segment, path: target });
  });
  return breadcrumbs;
}

const AdminStoragePage = () => {
  const { data: session } = useAuthSession();
  const navigationItems = useMemo(
    () => getPrimaryNavigationItems(session?.user?.role),
    [session?.user?.role],
  );
  const { toast } = useToast();

  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('gvm-admin-token') ?? '');
  const normalizedAdminToken = adminToken.trim();
  useEffect(() => {
    localStorage.setItem('gvm-admin-token', normalizedAdminToken);
  }, [normalizedAdminToken]);

  const [currentPath, setCurrentPath] = useState('');
  const [limit, setLimit] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(PAGE_SIZE_OPTIONS[0]);
  const [offset, setOffset] = useState(0);
  const [latestBackup, setLatestBackup] = useState<WordsBackupSummary | null>(null);

  const {
    data: storageData,
    isLoading,
    isFetching,
    refetch: refetchStorage,
  } = useQuery<SupabaseStorageListResponse>({
    queryKey: ['enrichment-storage', currentPath, limit, offset, normalizedAdminToken],
    queryFn: () =>
      fetchEnrichmentStorage({
        path: currentPath,
        limit,
        offset,
        adminToken: normalizedAdminToken,
      }),
  });

  const cleanExportMutation = useMutation({
    mutationFn: () => cleanAndExportEnrichmentStorage(normalizedAdminToken),
    onSuccess: (result) => {
      setLatestBackup(result.export.wordsBackup ?? null);
      const description = `Removed ${result.clean.deleted.toLocaleString()} of ${result.clean.total.toLocaleString()} objects, uploaded ${result.export.uploaded.toLocaleString()} file${
        result.export.uploaded === 1 ? '' : 's'
      } to ${result.export.bucket}.`;
      toast({
        title: 'Export complete',
        description,
      });
      refetchStorage();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to clean and export data.';
      toast({ title: 'Export failed', description: message, variant: 'destructive' });
    },
  });

  const exportInProgress = cleanExportMutation.isPending;

  const pagination = storageData?.pagination;

  const sortedItems: SupabaseStorageObjectSummary[] = useMemo(() => {
    if (!storageData?.items?.length) {
      return [];
    }
    return [...storageData.items].sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === 'folder' ? -1 : 1;
    });
  }, [storageData?.items]);

  const breadcrumbs = useMemo(() => buildBreadcrumbs(storageData?.path ?? currentPath), [
    storageData?.path,
    currentPath,
  ]);

  const hasPrevious = offset > 0;
  const hasNext = Boolean(pagination?.hasMore);
  const nextOffset = pagination?.nextOffset ?? (pagination?.hasMore ? offset + (pagination.limit ?? limit) : offset);

  const handleNavigateTo = (path: string) => {
    setCurrentPath(path);
    setOffset(0);
  };

  const handleParentNavigation = () => {
    if (!currentPath) return;
    const segments = currentPath.split('/').filter(Boolean);
    segments.pop();
    handleNavigateTo(segments.join('/'));
  };

  return (
    <AppShell
      sidebar={
        <div className="flex flex-col gap-2">
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
      }
      mobileNav={<MobileNavBar items={navigationItems} />}
      className="space-y-6"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">Supabase storage</h1>
            <p className="text-sm text-muted-foreground">
              View enrichment backups stored in the configured Supabase bucket.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetchStorage()}
              disabled={isFetching || cleanExportMutation.isPending}
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Refresh
            </Button>
            <Button onClick={() => cleanExportMutation.mutate()} disabled={exportInProgress}>
              {cleanExportMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              Export enrichment
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Cloud className="h-5 w-5 text-accent" /> Storage configuration
            </CardTitle>
            <CardDescription>
              Provide an optional admin token and review the active bucket details used for enrichment backups.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="admin-token">Admin token</Label>
              <Input
                id="admin-token"
                type="password"
                value={adminToken}
                placeholder="Optional token for protected environments"
                onChange={(event) => setAdminToken(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-border/60 bg-muted/40 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Bucket</p>
                <p className="mt-1 font-medium text-foreground">
                  {storageData?.bucket ?? 'Not configured'}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/40 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Path prefix</p>
                <p className="mt-1 font-medium text-foreground">
                  {storageData?.prefix ?? '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="text-lg font-semibold text-foreground">Words backup &amp; restore</CardTitle>
            <CardDescription>
              Each export writes a complete snapshot of the <code>words</code> table to Supabase Storage so you can
              recover the dataset if the database or repository files are lost.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {latestBackup ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-muted/40 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Generated</p>
                  <p className="mt-1 font-medium text-foreground">{formatTimestamp(latestBackup.generatedAt)}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/40 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total words</p>
                  <p className="mt-1 font-medium text-foreground">{latestBackup.totalWords.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/40 p-3 sm:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Storage object</p>
                  <p className="mt-1 font-mono text-sm text-foreground">{latestBackup.latestObjectPath}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Run an export to generate the latest <code>words</code> backup and surface restore details here.
              </p>
            )}
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Restore the dataset by running the CLI script below. The command truncates the <code>words</code> table
                before importing the JSON backup from Supabase Storage, so ensure you are targeting the correct
                environment.
              </p>
              <div className="rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground">
                npm run enrichment:restore -- --object{' '}
                {latestBackup?.latestObjectPath ?? 'backups/words-latest.json'} --force
              </div>
            </div>
          </CardContent>
        </Card>

        {!storageData?.available && !isLoading ? (
          <Alert className="border-dashed">
            <AlertTitle>Supabase storage is not configured</AlertTitle>
            <AlertDescription>
              Define SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ENRICHMENT_SUPABASE_BUCKET to enable the backup listing.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader className="gap-4 sm:flex sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold text-foreground">Bucket objects</CardTitle>
              <CardDescription>
                Browse the JSON enrichment snapshots stored for each provider and part of speech.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Folder className="h-4 w-4" />
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleNavigateTo('')}
                    className="h-auto px-2 py-1 text-sm"
                  >
                    Root
                  </Button>
                  {breadcrumbs.map((crumb, index) => (
                    <div key={crumb.path} className="flex items-center gap-1">
                      <span>/</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleNavigateTo(crumb.path)}
                        className="h-auto px-2 py-1 text-sm"
                      >
                        {crumb.label}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              {currentPath ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleParentNavigation}
                  className="flex items-center gap-1"
                >
                  <ArrowLeft className="h-4 w-4" /> Up one level
                </Button>
              ) : null}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Rows per page</span>
                <Select
                  value={String(limit)}
                  onValueChange={(value) => {
                    const parsed = Number.parseInt(value, 10) as (typeof PAGE_SIZE_OPTIONS)[number];
                    setLimit(parsed);
                    setOffset(0);
                  }}
                >
                  <SelectTrigger className="h-9 w-[80px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading bucket contents…
              </div>
            ) : sortedItems.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-[120px]">Type</TableHead>
                      <TableHead className="w-[120px] text-right">Size</TableHead>
                      <TableHead className="w-[200px]">Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedItems.map((item) => (
                      <TableRow key={item.path}>
                        <TableCell>
                          {item.type === 'folder' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto px-0 py-1 text-sm font-medium text-foreground"
                              onClick={() => handleNavigateTo(item.path)}
                            >
                              <Folder className="mr-2 h-4 w-4 text-accent" /> {item.name}
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              {item.name}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.type === 'folder' ? 'secondary' : 'outline'} className="font-medium">
                            {item.type === 'folder' ? 'Folder' : 'File'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {formatFileSize(item.size)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatTimestamp(item.updatedAt ?? item.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                No objects found for this prefix.
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {sortedItems.length.toLocaleString()} item{sortedItems.length === 1 ? '' : 's'} · Offset {offset.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={!hasPrevious}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset(nextOffset ?? offset)}
                  disabled={!hasNext}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
};

export default AdminStoragePage;
