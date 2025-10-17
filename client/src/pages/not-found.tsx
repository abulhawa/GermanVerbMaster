import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

const NOT_FOUND_IDS = {
  page: "not-found-page",
  card: "not-found-card",
  icon: "not-found-icon",
  message: "not-found-message",
  backButton: "not-found-back-button",
} as const;

export default function NotFound() {
  return (
    <div
      className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8"
      id={NOT_FOUND_IDS.page}
    >
      <Card className="mx-auto w-full max-w-lg border border-border bg-card shadow-sm" id={NOT_FOUND_IDS.card}>
        <CardHeader className="space-y-4 text-center">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/15"
            id={NOT_FOUND_IDS.icon}
          >
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-foreground">Page not found</CardTitle>
          <CardDescription className="text-sm text-muted-foreground" id={NOT_FOUND_IDS.message}>
            We couldn&apos;t find the view you were looking for. It may not be wired into the router yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-center">
          <p>
            Return to the practice hub to continue mastering German verbs.
          </p>
          <div className="flex justify-center">
            <Link href="/">
              <Button className="rounded-full px-6" id={NOT_FOUND_IDS.backButton}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to practice
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
