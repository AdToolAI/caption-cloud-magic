import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

interface CommentChartsProps {
  timeseries: { byDay: Array<{ date: string; pos: number; neu: number; neg: number }> };
  intentDistribution: Record<string, number>;
  heatmap: Array<{ topic: string; positive: number; neutral: number; negative: number }>;
  topTopics: Array<{ topic: string; count: number }>;
}

export function CommentCharts({ timeseries, intentDistribution, heatmap, topTopics }: CommentChartsProps) {
  const intentData = Object.entries(intentDistribution).map(([intent, count]) => ({
    intent: intent.charAt(0).toUpperCase() + intent.slice(1).replace('_', ' '),
    count
  }));

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))'];

  return (
    <div className="space-y-6">
      {/* Sentiment Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Sentiment über Zeit</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={timeseries.byDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="pos" stroke="#22c55e" name="Positiv" strokeWidth={2} />
              <Line type="monotone" dataKey="neu" stroke="#94a3b8" name="Neutral" strokeWidth={2} />
              <Line type="monotone" dataKey="neg" stroke="#ef4444" name="Negativ" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Intent Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Intent-Verteilung</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={intentData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="intent" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))">
                  {intentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Topic Cloud */}
        <Card>
          <CardHeader>
            <CardTitle>Themen-Cluster</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 p-4">
              {topTopics.map((topic, index) => {
                const size = Math.min(24 + (topic.count * 2), 48);
                return (
                  <div
                    key={topic.topic}
                    className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
                    style={{ fontSize: `${size}px` }}
                  >
                    <span className="font-medium text-primary">
                      {topic.topic}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({topic.count})
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Heatmap: Sentiment x Topics */}
      <Card>
        <CardHeader>
          <CardTitle>Sentiment × Top-Themen Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="p-2 text-left border">Thema</th>
                  <th className="p-2 text-center border bg-green-50">Positiv</th>
                  <th className="p-2 text-center border bg-gray-50">Neutral</th>
                  <th className="p-2 text-center border bg-red-50">Negativ</th>
                </tr>
              </thead>
              <tbody>
                {heatmap.map((row) => {
                  const total = row.positive + row.neutral + row.negative;
                  const maxVal = Math.max(row.positive, row.neutral, row.negative);
                  
                  return (
                    <tr key={row.topic}>
                      <td className="p-2 border font-medium">{row.topic}</td>
                      <td 
                        className="p-2 text-center border"
                        style={{ 
                          backgroundColor: `rgba(34, 197, 94, ${row.positive / maxVal * 0.7})`,
                          color: row.positive === maxVal ? 'white' : 'inherit'
                        }}
                      >
                        {row.positive}
                      </td>
                      <td 
                        className="p-2 text-center border"
                        style={{ 
                          backgroundColor: `rgba(148, 163, 184, ${row.neutral / maxVal * 0.7})`,
                          color: row.neutral === maxVal ? 'white' : 'inherit'
                        }}
                      >
                        {row.neutral}
                      </td>
                      <td 
                        className="p-2 text-center border"
                        style={{ 
                          backgroundColor: `rgba(239, 68, 68, ${row.negative / maxVal * 0.7})`,
                          color: row.negative === maxVal ? 'white' : 'inherit'
                        }}
                      >
                        {row.negative}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
