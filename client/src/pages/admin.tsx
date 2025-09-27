import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import type { GermanVerb } from "@shared";
import type { VerbAnalytics } from "@db/schema";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const LEVEL_OPTIONS: GermanVerb["level"][] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const PATTERN_TYPES = ["ablaut", "mixed", "modal", "other"];
const PATTERN_TYPE_NONE = "__none__" as const;

interface AdminVerbFormState {
  infinitive: string;
  english: string;
  präteritum: string;
  partizipII: string;
  auxiliary: GermanVerb["auxiliary"];
  level: GermanVerb["level"];
  präteritumExample: string;
  partizipIIExample: string;
  sourceName: string;
  sourceLevelReference: string;
  patternType: string;
  patternGroup: string;
}

type VerbRecord = Omit<GermanVerb, "source" | "pattern"> & {
  id: number;
  createdAt?: number | string | Date | null;
  updatedAt?: number | string | Date | null;
  source: GermanVerb["source"] | string | null;
  pattern?: GermanVerb["pattern"] | string | null;
};

type NormalizedVerbRecord = Omit<VerbRecord, "source" | "pattern"> & {
  source: GermanVerb["source"] | null;
  pattern: NonNullable<GermanVerb["pattern"]> | null;
};

type OverviewColumnKey =
  | "index"
  | "infinitive"
  | "english"
  | "level"
  | "pattern"
  | "source"
  | "attempts"
  | "successRate"
  | "lastPracticed"
  | "updated";

interface VerbOverviewRow {
  verb: NormalizedVerbRecord;
  analytics: {
    totalAttempts: number;
    correctAttempts: number;
    successRate: number | null;
    lastPracticed: Date | undefined;
  };
  updated: Date | undefined;
  patternLabel: string;
  sourceLabel: string;
}

interface OverviewTableColumn {
  key: OverviewColumnKey;
  label: string;
  className?: string;
  align?: "left" | "right";
  sortable?: boolean;
  getSortValue: (row: VerbOverviewRow) => string | number;
  render: (
    row: VerbOverviewRow,
    options: { isAnalyticsFetching: boolean; rowIndex: number }
  ) => ReactNode;
}

const OVERVIEW_COLUMNS: OverviewTableColumn[] = [
  {
    key: "index",
    label: "#",
    className: "w-12 text-right",
    align: "right",
    sortable: false,
    getSortValue: () => 0,
    render: (_row, { rowIndex }) => rowIndex + 1,
  },
  {
    key: "infinitive",
    label: "Infinitive",
    className: "min-w-[140px]",
    sortable: true,
    getSortValue: (row) => row.verb.infinitive.toLowerCase(),
    render: (row, _context) => <span className="font-medium">{row.verb.infinitive}</span>,
  },
  {
    key: "english",
    label: "English",
    className: "min-w-[160px]",
    sortable: true,
    getSortValue: (row) => row.verb.english.toLowerCase(),
    render: (row, _context) => <span className="text-muted-foreground">{row.verb.english}</span>,
  },
  {
    key: "level",
    label: "Level",
    sortable: true,
    getSortValue: (row) => row.verb.level,
    render: (row, _context) => row.verb.level,
  },
  {
    key: "pattern",
    label: "Pattern",
    className: "min-w-[160px]",
    sortable: true,
    getSortValue: (row) => row.patternLabel.toLowerCase(),
    render: (row, _context) => row.patternLabel || "—",
  },
  {
    key: "source",
    label: "Source",
    className: "min-w-[160px]",
    sortable: true,
    getSortValue: (row) => row.sourceLabel.toLowerCase(),
    render: (row, _context) => row.sourceLabel || "—",
  },
  {
    key: "attempts",
    label: "Attempts",
    className: "min-w-[120px] text-right",
    align: "right",
    sortable: true,
    getSortValue: (row) => row.analytics.totalAttempts,
    render: (row, { isAnalyticsFetching }) =>
      isAnalyticsFetching ? "…" : row.analytics.totalAttempts,
  },
  {
    key: "successRate",
    label: "Success rate",
    className: "min-w-[120px] text-right",
    align: "right",
    sortable: true,
    getSortValue: (row) => row.analytics.successRate ?? -1,
    render: (row, { isAnalyticsFetching }) =>
      isAnalyticsFetching
        ? "…"
        : row.analytics.successRate !== null
          ? `${row.analytics.successRate}%`
          : "—",
  },
  {
    key: "lastPracticed",
    label: "Last practiced",
    className: "min-w-[140px] text-right",
    align: "right",
    sortable: true,
    getSortValue: (row) => row.analytics.lastPracticed?.getTime() ?? 0,
    render: (row, { isAnalyticsFetching }) =>
      isAnalyticsFetching
        ? "…"
        : row.analytics.lastPracticed
          ? row.analytics.lastPracticed.toLocaleDateString()
          : "—",
  },
  {
    key: "updated",
    label: "Updated",
    className: "min-w-[140px] text-right",
    align: "right",
    sortable: true,
    getSortValue: (row) => row.updated?.getTime() ?? 0,
    render: (row, _context) => (row.updated ? row.updated.toLocaleDateString() : "—"),
  },
];

function createDefaultFormState(): AdminVerbFormState {
  return {
    infinitive: "",
    english: "",
    präteritum: "",
    partizipII: "",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "",
    partizipIIExample: "",
    sourceName: "",
    sourceLevelReference: "",
    patternType: PATTERN_TYPE_NONE,
    patternGroup: "",
  };
}

function toDate(value: VerbRecord["createdAt"]): Date | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (value instanceof Date) {
    return value;
  }

  const numericValue = typeof value === "string" ? Number(value) : value;

  if (typeof numericValue === "number" && !Number.isNaN(numericValue)) {
    const ms = numericValue > 1_000_000_000_000 ? numericValue : numericValue * 1000;
    return new Date(ms);
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }

  return undefined;
}

function parseJsonField<T>(value: unknown): T | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  if (typeof value === "object") {
    return value as T;
  }

  return null;
}

export default function AdminPage() {
  const { toast } = useToast();
  const [adminToken, setAdminToken] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return localStorage.getItem("gvm-admin-token") ?? "";
  });
  const [formState, setFormState] = useState<AdminVerbFormState>(() => createDefaultFormState());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (adminToken) {
      localStorage.setItem("gvm-admin-token", adminToken);
    } else {
      localStorage.removeItem("gvm-admin-token");
    }
  }, [adminToken]);

  const { data: verbs = [], isFetching, refetch } = useQuery<VerbRecord[]>({
    queryKey: ["/api/verbs"],
  });

  const {
    data: analytics = [],
    isFetching: isAnalyticsFetching,
  } = useQuery<VerbAnalytics[]>({
    queryKey: ["/api/analytics"],
  });

  const normalizedVerbs = useMemo<NormalizedVerbRecord[]>(() => {
    return verbs.map((verb) => ({
      ...verb,
      source: parseJsonField<GermanVerb["source"]>(verb.source) ?? null,
      pattern: parseJsonField<NonNullable<GermanVerb["pattern"]>>(verb.pattern) ?? null,
    }));
  }, [verbs]);

  const mutation = useMutation({
    mutationFn: async (payload: GermanVerb) => {
      const response = await fetch("/api/admin/verbs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || response.statusText);
      }

      return response.json() as Promise<VerbRecord>;
    },
    onSuccess: (verb) => {
      toast({
        title: "Verb saved",
        description: `${verb.infinitive} added for level ${verb.level}.`,
      });
      setFormState(createDefaultFormState());
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to save verb",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const levelSummary = useMemo(() => {
    return LEVEL_OPTIONS.map((level) => ({
      level,
      count: normalizedVerbs.filter((verb) => verb.level === level).length,
    }));
  }, [normalizedVerbs]);

  const recentVerbs = useMemo(() => {
    return [...normalizedVerbs]
      .sort((a, b) => {
        const aDate = toDate(a.updatedAt ?? a.createdAt)?.getTime() ?? 0;
        const bDate = toDate(b.updatedAt ?? b.createdAt)?.getTime() ?? 0;
        return bDate - aDate;
      })
      .slice(0, 10);
  }, [normalizedVerbs]);

  const totalVerbs = normalizedVerbs.length;

  const verbsWithAnalytics = useMemo<VerbOverviewRow[]>(() => {
    const analyticsByVerb = new Map<string, VerbAnalytics>();
    for (const item of analytics) {
      analyticsByVerb.set(item.verb, item);
    }

    return [...normalizedVerbs]
      .map((verb) => {
        const analyticsForVerb = analyticsByVerb.get(verb.infinitive);
        const totalAttempts = analyticsForVerb?.totalAttempts ?? 0;
        const correctAttempts = analyticsForVerb?.correctAttempts ?? 0;
        const successRate =
          totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : null;
        const lastPracticed = analyticsForVerb?.lastPracticedAt
          ? toDate(analyticsForVerb.lastPracticedAt)
          : undefined;
        const updated = toDate(verb.updatedAt ?? verb.createdAt);
        const patternLabel = verb.pattern
          ? `${verb.pattern.type}${verb.pattern.group ? ` (${verb.pattern.group})` : ""}`
          : "";
        const sourceLabel = verb.source
          ? `${verb.source.name}${verb.source.levelReference ? ` · ${verb.source.levelReference}` : ""}`
          : "";

        return {
          verb,
          analytics: {
            totalAttempts,
            correctAttempts,
            successRate,
            lastPracticed,
          },
          updated,
          patternLabel,
          sourceLabel,
        };
      })
      .sort((a, b) => a.verb.infinitive.localeCompare(b.verb.infinitive));
  }, [analytics, normalizedVerbs]);

  const progressSummary = useMemo(() => {
    if (analytics.length === 0) {
      return {
        trackedVerbs: 0,
        totalAttempts: 0,
        overallSuccessRate: null as number | null,
      };
    }

    const trackedVerbs = analytics.length;
    const totalAttempts = analytics.reduce((sum, item) => sum + item.totalAttempts, 0);
    const correctAttempts = analytics.reduce((sum, item) => sum + item.correctAttempts, 0);
    const overallSuccessRate = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : null;

    return {
      trackedVerbs,
      totalAttempts,
      overallSuccessRate,
    };
  }, [analytics]);

  const [levelFilter, setLevelFilter] = useState<GermanVerb["level"] | "all">("all");
  const [minAttemptsFilter, setMinAttemptsFilter] = useState("");
  const [maxAttemptsFilter, setMaxAttemptsFilter] = useState("");
  const [sortColumn, setSortColumn] = useState<OverviewColumnKey>("infinitive");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [visibleColumns, setVisibleColumns] = useState<Record<OverviewColumnKey, boolean>>(() => {
    return OVERVIEW_COLUMNS.reduce((acc, column) => {
      acc[column.key] = true;
      return acc;
    }, {} as Record<OverviewColumnKey, boolean>);
  });

  const visibleColumnList = useMemo(() => {
    return OVERVIEW_COLUMNS.filter((column) => visibleColumns[column.key]);
  }, [visibleColumns]);

  const filteredVerbs = useMemo(() => {
    const minAttempts = minAttemptsFilter.trim() === "" ? null : Number(minAttemptsFilter);
    const maxAttempts = maxAttemptsFilter.trim() === "" ? null : Number(maxAttemptsFilter);
    const normalizedMin = minAttempts !== null && !Number.isNaN(minAttempts) ? minAttempts : null;
    const normalizedMax = maxAttempts !== null && !Number.isNaN(maxAttempts) ? maxAttempts : null;

    return verbsWithAnalytics.filter((item) => {
      if (levelFilter !== "all" && item.verb.level !== levelFilter) {
        return false;
      }

      if (normalizedMin !== null && item.analytics.totalAttempts < normalizedMin) {
        return false;
      }

      if (normalizedMax !== null && item.analytics.totalAttempts > normalizedMax) {
        return false;
      }

      return true;
    });
  }, [levelFilter, maxAttemptsFilter, minAttemptsFilter, verbsWithAnalytics]);

  const sortedVerbs = useMemo(() => {
    const column = OVERVIEW_COLUMNS.find((item) => item.key === sortColumn);
    if (!column) {
      return filteredVerbs;
    }

    const sorted = [...filteredVerbs].sort((a, b) => {
      const aValue = column.getSortValue(a);
      const bValue = column.getSortValue(b);

      if (typeof aValue === "string" && typeof bValue === "string") {
        return aValue.localeCompare(bValue, undefined, { sensitivity: "base" });
      }

      if (typeof aValue === "number" && typeof bValue === "number") {
        return aValue - bValue;
      }

      return String(aValue).localeCompare(String(bValue));
    });

    return sortDirection === "asc" ? sorted : sorted.reverse();
  }, [filteredVerbs, sortColumn, sortDirection]);

  const hasActiveFilters =
    levelFilter !== "all" || minAttemptsFilter.trim() !== "" || maxAttemptsFilter.trim() !== "";

  const emptyStateMessage = isFetching
    ? "Loading…"
    : verbsWithAnalytics.length === 0
      ? "No verbs available yet."
      : "No verbs match the current filters.";

  const handleColumnToggle = (key: OverviewColumnKey, checked: CheckedState) => {
    const nextChecked = checked === true;
    setVisibleColumns((prev) => {
      const currentlyVisible = Object.values(prev).filter(Boolean).length;
      if (!nextChecked && currentlyVisible <= 1) {
        return prev;
      }

      return {
        ...prev,
        [key]: nextChecked,
      };
    });
  };

  const handleSort = (key: OverviewColumnKey) => {
    setSortColumn((currentColumn) => {
      if (currentColumn === key) {
        setSortDirection((prevDirection) => (prevDirection === "asc" ? "desc" : "asc"));
        return currentColumn;
      }

      setSortDirection("asc");
      return key;
    });
  };

  const handleResetFilters = () => {
    setLevelFilter("all");
    setMinAttemptsFilter("");
    setMaxAttemptsFilter("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!adminToken) {
      toast({
        title: "Admin token required",
        description: "Set the admin API token before saving verbs.",
        variant: "destructive",
      });
      return;
    }

    const payload: GermanVerb = {
      infinitive: formState.infinitive.trim(),
      english: formState.english.trim(),
      präteritum: formState.präteritum.trim(),
      partizipII: formState.partizipII.trim(),
      auxiliary: formState.auxiliary,
      level: formState.level,
      präteritumExample: formState.präteritumExample.trim(),
      partizipIIExample: formState.partizipIIExample.trim(),
      source: {
        name: formState.sourceName.trim(),
        levelReference: formState.sourceLevelReference.trim(),
      },
      pattern: formState.patternType !== PATTERN_TYPE_NONE
        ? {
            type: formState.patternType,
            ...(formState.patternGroup.trim()
              ? { group: formState.patternGroup.trim() }
              : {}),
          }
        : null,
    };

    mutation.mutate(payload);
  };

  const updateForm = (field: keyof AdminVerbFormState, value: string) => {
    setFormState((prev) => {
      if (field === "patternType") {
        return {
          ...prev,
          patternType: value,
          patternGroup: value === PATTERN_TYPE_NONE ? "" : prev.patternGroup,
        };
      }

      return {
        ...prev,
        [field]: value,
      };
    });
  };

  return (
    <div className="min-h-screen bg-muted/30 py-10">
      <div className="container mx-auto max-w-5xl space-y-8 px-4">
        <div>
          <h1 className="text-3xl font-bold">Verb Corpus Admin</h1>
          <p className="text-muted-foreground">
            Upload new verbs, manage tagging metadata, and track distribution readiness.
          </p>
        </div>

        <Tabs defaultValue="manage" className="space-y-6">
          <TabsList className="grid w-full gap-2 bg-background p-2 sm:grid-cols-2">
            <TabsTrigger value="manage">Manage corpus</TabsTrigger>
            <TabsTrigger value="overview">Corpus overview</TabsTrigger>
          </TabsList>

          <TabsContent value="manage" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Admin Access</CardTitle>
                  <CardDescription>
                    Provide the API token configured on the server to enable write access.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="admin-token">Admin API token</Label>
                    <Input
                      id="admin-token"
                      type="password"
                      placeholder="••••••••"
                      value={adminToken}
                      onChange={(event) => setAdminToken(event.target.value)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The token is stored locally in your browser so you do not have to re-enter it on every visit.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Corpus snapshot</CardTitle>
                  <CardDescription>
                    Overview of verbs currently available to learners.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {levelSummary.map(({ level, count }) => (
                      <Badge key={level} variant="outline" className="px-3 py-1 text-sm">
                        {level}: {count}
                      </Badge>
                    ))}
                  </div>
                  <Separator />
                  <div className="text-sm text-muted-foreground">
                    <p>Total verbs: {isFetching ? "…" : totalVerbs}</p>
                    <p>Recently updated verbs appear in the table below.</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Add a new verb</CardTitle>
                <CardDescription>
                  Fill out the form with grammatical forms, CEFR level, and tagging metadata. Examples help generate practice prompts.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="infinitive">Infinitive</Label>
                    <Input
                  id="infinitive"
                  required
                  value={formState.infinitive}
                  onChange={(event) => updateForm("infinitive", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="english">English meaning</Label>
                <Input
                  id="english"
                  required
                  value={formState.english}
                  onChange={(event) => updateForm("english", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prateritum">Präteritum</Label>
                <Input
                  id="prateritum"
                  required
                  value={formState.präteritum}
                  onChange={(event) => updateForm("präteritum", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partizip">
                  Partizip II
                </Label>
                <Input
                  id="partizip"
                  required
                  value={formState.partizipII}
                  onChange={(event) => updateForm("partizipII", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Auxiliary</Label>
                <Select
                  value={formState.auxiliary}
                  onValueChange={(value) => updateForm("auxiliary", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select auxiliary" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="haben">haben</SelectItem>
                    <SelectItem value="sein">sein</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>CEFR level</Label>
                <Select
                  value={formState.level}
                  onValueChange={(value) => updateForm("level", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVEL_OPTIONS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="praeteritum-example">Präteritum example sentence</Label>
                <Textarea
                  id="praeteritum-example"
                  required
                  rows={2}
                  value={formState.präteritumExample}
                  onChange={(event) => updateForm("präteritumExample", event.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="partizip-example">Partizip II example sentence</Label>
                <Textarea
                  id="partizip-example"
                  required
                  rows={2}
                  value={formState.partizipIIExample}
                  onChange={(event) => updateForm("partizipIIExample", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source-name">Source name</Label>
                <Input
                  id="source-name"
                  required
                  placeholder="e.g. Duden"
                  value={formState.sourceName}
                  onChange={(event) => updateForm("sourceName", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source-ref">Source reference</Label>
                <Input
                  id="source-ref"
                  required
                  placeholder="e.g. B1 Kapitel 3"
                  value={formState.sourceLevelReference}
                  onChange={(event) => updateForm("sourceLevelReference", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Pattern type</Label>
                <Select
                  value={formState.patternType}
                  onValueChange={(value) => updateForm("patternType", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PATTERN_TYPE_NONE}>None</SelectItem>
                    {PATTERN_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pattern-group">Pattern group</Label>
                <Input
                  id="pattern-group"
                  placeholder="Optional grouping tag"
                  value={formState.patternGroup}
                  onChange={(event) => updateForm("patternGroup", event.target.value)}
                  disabled={formState.patternType === PATTERN_TYPE_NONE}
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Saving…" : "Save verb"}
                </Button>
              </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent updates</CardTitle>
                <CardDescription>
                  Track the latest verbs and tagging information that will sync to offline bundles.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Infinitive</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Pattern</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentVerbs.map((verb) => {
                      const updated = toDate(verb.updatedAt ?? verb.createdAt);
                      return (
                        <TableRow key={verb.id}>
                          <TableCell className="font-medium">{verb.infinitive}</TableCell>
                          <TableCell>{verb.level}</TableCell>
                          <TableCell>
                            {verb.pattern?.type ?? "—"}
                            {verb.pattern?.group ? ` (${verb.pattern.group})` : ""}
                          </TableCell>
                          <TableCell>{verb.source?.name ?? "—"}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {updated ? updated.toLocaleDateString() : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {recentVerbs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          {isFetching ? "Loading…" : "No verbs available yet."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Learning progress</CardTitle>
                <CardDescription>
                  Aggregated analytics from learner practice sessions.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Tracked verbs</p>
                  <p className="text-2xl font-semibold">
                    {isAnalyticsFetching ? "…" : progressSummary.trackedVerbs}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total attempts</p>
                  <p className="text-2xl font-semibold">
                    {isAnalyticsFetching ? "…" : progressSummary.totalAttempts}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Overall success rate</p>
                  <p className="text-2xl font-semibold">
                    {isAnalyticsFetching
                      ? "…"
                      : progressSummary.overallSuccessRate !== null
                        ? `${progressSummary.overallSuccessRate}%`
                        : "—"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Verb corpus</CardTitle>
                <CardDescription>
                  Review every verb, its tagging metadata, and live learner progress.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="grid w-full gap-4 sm:grid-cols-2 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Level</Label>
                      <Select
                        value={levelFilter}
                        onValueChange={(value) =>
                          setLevelFilter(value === "all" ? "all" : (value as GermanVerb["level"]))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="All levels" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All levels</SelectItem>
                          {LEVEL_OPTIONS.map((level) => (
                            <SelectItem key={level} value={level}>
                              {level}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="min-attempts">Min attempts</Label>
                      <Input
                        id="min-attempts"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={minAttemptsFilter}
                        onChange={(event) => setMinAttemptsFilter(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="max-attempts">Max attempts</Label>
                      <Input
                        id="max-attempts"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={maxAttemptsFilter}
                        onChange={(event) => setMaxAttemptsFilter(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          Columns
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {OVERVIEW_COLUMNS.map((column) => (
                          <DropdownMenuCheckboxItem
                            key={column.key}
                            checked={visibleColumns[column.key]}
                            onCheckedChange={(checked) => handleColumnToggle(column.key, checked)}
                          >
                            {column.label}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={handleResetFilters}>
                        Reset filters
                      </Button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {visibleColumnList.map((column) => {
                          const isSorted = sortColumn === column.key;
                          return (
                            <TableHead key={column.key} className={column.className}>
                              {column.sortable ? (
                                <button
                                  type="button"
                                  className={cn(
                                    "flex w-full items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                                    column.align === "right" ? "justify-end text-right" : "justify-start text-left"
                                  )}
                                  onClick={() => handleSort(column.key)}
                                >
                                  <span>{column.label}</span>
                                  {isSorted && (
                                    <span aria-hidden="true" className="text-xs">
                                      {sortDirection === "asc" ? "▲" : "▼"}
                                    </span>
                                  )}
                                  <span className="sr-only">
                                    {isSorted
                                      ? `Sort ${sortDirection === "asc" ? "descending" : "ascending"}`
                                      : "Enable sorting"}
                                  </span>
                                </button>
                              ) : (
                                column.label
                              )}
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedVerbs.map((row, rowIndex) => (
                        <TableRow key={row.verb.id}>
                          {visibleColumnList.map((column) => (
                            <TableCell key={column.key} className={column.className}>
                              {column.render(row, { isAnalyticsFetching, rowIndex })}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      {sortedVerbs.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={visibleColumnList.length || 1}
                            className="text-center text-muted-foreground"
                          >
                            {emptyStateMessage}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
