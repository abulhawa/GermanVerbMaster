import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/primitives/card";
import { Page } from "@/components/primitives/page";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <Page className="flex min-h-[70vh] w-full items-center justify-center">
      <Card className="mx-auto w-full max-w-lg text-center">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/15">
            <AlertCircle className="h-8 w-8 text-danger" />
          </div>
          <CardTitle className="text-fg">Page not found</CardTitle>
          <CardDescription className="text-sm text-muted">
            We couldn&apos;t find the view you were looking for. It may not be wired into the router yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-center">
          <p>
            Return to the practice hub to continue mastering German verbs.
          </p>
          <div className="flex justify-center">
            <Button asChild className="px-6">
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                Back to practice
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </Page>
  );
}
