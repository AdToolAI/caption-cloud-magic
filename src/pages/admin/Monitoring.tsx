import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { toast } from "sonner";
import { RefreshCw, Activity, Clock, CheckCircle, AlertCircle, Users, Database } from "lucide-react";

interface AdminStats {
  timestamp: string;
  active_publishes: Array<{ user_id: string; active_count: number; oldest_started: string }>;
  avg_duration: Array<{ provider: string; avg_duration_ms: number; total_count: number }>;
  success_rate: Array<{ provider: string; success_ratio: number; success_count: number; error_count: number; total_count: number }>;
  quota_usage: Array<{ user_id: string; quota_mb: number; used_mb: number; usage_percent: number }>;
  cron_summary: Array<{ hour: string; avg_duration_ms: number; success_runs: number; error_runs: number; total_runs: number }>;
}

export default function Monitoring() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  // Check admin role
  useEffect(() => {
    const checkAdminRole = async () => {
      if (!user) {
        navigate('/auth');
        return;
      }

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (error || !data) {
        navigate('/unauthorized');
        return;
      }

      setIsAdmin(true);
    };

    checkAdminRole();
  }, [user, navigate]);

  // Fetch stats
  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-stats');
      
      if (error) throw error;
      
      setStats(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      toast.error('Failed to fetch monitoring data');
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!isAdmin) return;

    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    
    return () => clearInterval(interval);
  }, [isAdmin]);

  if (isAdmin === null || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardHeader>
            <CardTitle>No Data</CardTitle>
            <CardDescription>Monitoring data is not available yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={fetchStats}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate overview metrics
  const totalActivePublishes = stats.active_publishes.reduce((sum, item) => sum + item.active_count, 0);
  const avgDurationOverall = stats.avg_duration.length > 0
    ? Math.round(stats.avg_duration.reduce((sum, item) => sum + item.avg_duration_ms, 0) / stats.avg_duration.length)
    : 0;
  const avgSuccessRate = stats.success_rate.length > 0
    ? Math.round((stats.success_rate.reduce((sum, item) => sum + item.success_ratio, 0) / stats.success_rate.length) * 100)
    : 0;
  const lastCronRun = stats.cron_summary.length > 0 ? new Date(stats.cron_summary[0].hour).toLocaleString() : 'N/A';

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Monitoring</h1>
          <p className="text-muted-foreground">
            Last updated: {lastUpdate?.toLocaleTimeString() || 'Never'}
          </p>
        </div>
        <Button onClick={fetchStats} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="cron">Cron</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Publishes</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalActivePublishes}</div>
                <p className="text-xs text-muted-foreground">Total jobs in progress</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{avgDurationOverall}ms</div>
                <p className="text-xs text-muted-foreground">Average processing time</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{avgSuccessRate}%</div>
                <p className="text-xs text-muted-foreground">Last 7 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Last Cron Run</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-sm font-bold">{lastCronRun}</div>
                <p className="text-xs text-muted-foreground">Background processing</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Providers Tab */}
        <TabsContent value="providers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Provider Performance</CardTitle>
              <CardDescription>Success rates and average duration per provider (last 7 days)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Success Rate</TableHead>
                    <TableHead className="text-right">Avg Duration (ms)</TableHead>
                    <TableHead className="text-right">Success</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.success_rate.map((item) => {
                    const duration = stats.avg_duration.find(d => d.provider === item.provider);
                    return (
                      <TableRow key={item.provider}>
                        <TableCell className="font-medium">{item.provider}</TableCell>
                        <TableCell className="text-right">
                          {(item.success_ratio * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right">
                          {duration?.avg_duration_ms?.toFixed(0) || 'N/A'}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {item.success_count}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {item.error_count}
                        </TableCell>
                        <TableCell className="text-right">{item.total_count}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Success Rate by Provider</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.success_rate}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="provider" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="success_ratio" fill="hsl(var(--primary))" name="Success Rate" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Storage Quota Usage</CardTitle>
              <CardDescription>Top users by storage consumption</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead className="text-right">Used (MB)</TableHead>
                    <TableHead className="text-right">Quota (MB)</TableHead>
                    <TableHead className="text-right">Usage %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.quota_usage
                    .sort((a, b) => b.usage_percent - a.usage_percent)
                    .slice(0, 10)
                    .map((item) => (
                      <TableRow key={item.user_id}>
                        <TableCell className="font-mono text-xs">
                          {item.user_id.substring(0, 8)}...
                        </TableCell>
                        <TableCell className="text-right">{item.used_mb}</TableCell>
                        <TableCell className="text-right">{item.quota_mb}</TableCell>
                        <TableCell className="text-right">
                          <span className={item.usage_percent > 80 ? 'text-red-600 font-semibold' : ''}>
                            {item.usage_percent}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active Publishes per User</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead className="text-right">Active Jobs</TableHead>
                    <TableHead>Oldest Job Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.active_publishes.map((item) => (
                    <TableRow key={item.user_id}>
                      <TableCell className="font-mono text-xs">
                        {item.user_id.substring(0, 8)}...
                      </TableCell>
                      <TableCell className="text-right">{item.active_count}</TableCell>
                      <TableCell>
                        {new Date(item.oldest_started).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {stats.active_publishes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No active publishes
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cron Tab */}
        <TabsContent value="cron" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cron Job Performance</CardTitle>
              <CardDescription>Background job execution statistics (last 7 days)</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={stats.cron_summary.slice().reverse()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="hour" 
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(value) => new Date(value).toLocaleString()}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="avg_duration_ms" 
                    stroke="hsl(var(--primary))" 
                    name="Avg Duration (ms)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Success vs Error Runs</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.cron_summary.slice().reverse()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="hour" 
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(value) => new Date(value).toLocaleString()}
                  />
                  <Legend />
                  <Bar dataKey="success_runs" stackId="a" fill="hsl(var(--success))" name="Success" />
                  <Bar dataKey="error_runs" stackId="a" fill="hsl(var(--destructive))" name="Errors" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
