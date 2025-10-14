import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type DebuggableComponentProps,
  getDevAttributes,
} from "@/lib/dev-attributes";

interface AnalyticsDashboardProps extends DebuggableComponentProps {}

export function AnalyticsDashboard({ debugId }: AnalyticsDashboardProps) {
  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : "analytics-dashboard";

  return (
    <Card
      {...getDevAttributes("analytics-dashboard-empty", resolvedDebugId)}
      className="border-border bg-card text-fg"
    >
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Analytics reboot in progress</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          The legacy analytics endpoints have been retired while we migrate to the new lexeme task
          system. Fresh insights will return once the replacement pipeline is live.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Keep practising—every submission through the new task feed is already captured in the
          modern history tables. We&apos;re building richer visualisations tailored to the updated data
          model.
        </p>
        <p>
          In the meantime you can continue using adaptive review and practice sessions as normal;
          progress tracking remains intact.
        </p>
      </CardContent>
    </Card>
  );
}
