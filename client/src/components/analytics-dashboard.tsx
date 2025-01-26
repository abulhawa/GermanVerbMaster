import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { VerbAnalytics, VerbPracticeHistory } from "@db/schema";
import { Loader2 } from "lucide-react";

export function AnalyticsDashboard() {
  const { data: analytics, isLoading: analyticsLoading } = useQuery<VerbAnalytics[]>({
    queryKey: ["/api/analytics"],
  });

  const { data: history, isLoading: historyLoading } = useQuery<VerbPracticeHistory[]>({
    queryKey: ["/api/practice-history"],
  });

  if (analyticsLoading || historyLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!analytics || !history) {
    return <div>No data available</div>;
  }

  // Calculate success rate over time
  const successRateData = history.reduce((acc: any[], attempt, index, array) => {
    if (index % 10 === 0) { // Group by every 10 attempts
      const slice = array.slice(index, index + 10);
      const correct = slice.filter(a => a.result === 'correct').length;
      acc.push({
        attempts: `${index + 1}-${index + 10}`,
        rate: (correct / slice.length) * 100
      });
    }
    return acc;
  }, []);

  // Calculate most challenging verbs
  const challengingVerbs = analytics
    .map(verb => ({
      verb: verb.verb,
      successRate: (verb.correctAttempts / verb.totalAttempts) * 100,
      attempts: verb.totalAttempts
    }))
    .sort((a, b) => a.successRate - b.successRate)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Success Rate Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={successRateData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="attempts" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="hsl(var(--primary))"
                  name="Success Rate (%)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Most Challenging Verbs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={challengingVerbs}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="verb" />
                <YAxis />
                <Tooltip />
                <Bar
                  dataKey="successRate"
                  fill="hsl(var(--primary))"
                  name="Success Rate (%)"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Practice History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {history.slice(0, 10).map((attempt, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg ${
                  attempt.result === 'correct'
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">{attempt.verb}</p>
                    <p className="text-sm text-muted-foreground">
                      Mode: {attempt.mode}, Level: {attempt.level}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">
                      {attempt.result === 'correct' ? 'Correct' : 'Incorrect'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {Math.round(attempt.timeSpent / 1000)}s
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
