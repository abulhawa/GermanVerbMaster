import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <Card className="mx-auto w-full max-w-lg border border-border bg-card shadow-sm">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/15">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-foreground">Page not found</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            We couldn&apos;t find the view you were looking for. It may not be wired into the router yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-center">
          <p>
            Return to the enrichment console to continue refining the lexicon.
          </p>
          <div className="flex justify-center">
            <Link href="/admin/enrichment">
              <Button className="rounded-full px-6">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to enrichment
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
