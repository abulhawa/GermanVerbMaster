import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import type { GermanVerb } from "@shared";

const LEVEL_OPTIONS: GermanVerb["level"][] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const PATTERN_TYPES = ["ablaut", "mixed", "modal", "other"];

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

interface VerbRecord extends GermanVerb {
  id: number;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
}

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
    patternType: "",
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
      count: verbs.filter((verb) => verb.level === level).length,
    }));
  }, [verbs]);

  const recentVerbs = useMemo(() => {
    return [...verbs]
      .sort((a, b) => {
        const aDate = toDate(a.updatedAt ?? a.createdAt)?.getTime() ?? 0;
        const bDate = toDate(b.updatedAt ?? b.createdAt)?.getTime() ?? 0;
        return bDate - aDate;
      })
      .slice(0, 10);
  }, [verbs]);

  const totalVerbs = verbs.length;

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
      pattern: formState.patternType
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
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
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
                    <SelectItem value="">None</SelectItem>
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
                  disabled={!formState.patternType}
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
                      <TableCell>{verb.source.name}</TableCell>
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
      </div>
    </div>
  );
}
