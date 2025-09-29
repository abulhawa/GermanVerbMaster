import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.28),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(45,212,191,0.22),transparent_60%)]" />

      <Card className="relative z-10 mx-auto w-full max-w-lg overflow-hidden border border-white/10 bg-white/[0.05] shadow-2xl backdrop-blur">
        <div className="pointer-events-none absolute -top-10 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <CardHeader className="relative z-10 space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/20">
            <AlertCircle className="h-8 w-8 text-rose-200" />
          </div>
          <CardTitle className="text-3xl font-semibold text-foreground">Page not found</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            We couldn&apos;t find the view you were looking for. It may not be wired into the router yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="relative z-10 space-y-6 text-center">
          <p className="text-sm text-muted-foreground">
            Return to the practice hub to continue mastering German verbs.
          </p>
          <div className="flex justify-center">
            <Link href="/">
              <Button className="rounded-full px-6">
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
