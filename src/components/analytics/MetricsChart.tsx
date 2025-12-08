import { motion } from "framer-motion";
import { TrendingUp, BarChart3 } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface MetricsSummary {
  provider: string;
  day: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  impressions: number;
  avg_engagement: number;
}

interface MetricsChartProps {
  data: MetricsSummary[];
  loading: boolean;
  byProvider?: boolean;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="backdrop-blur-xl bg-card/90 border border-white/20 rounded-xl p-4 
                      shadow-[0_0_30px_hsla(43,90%,68%,0.1)]">
        <p className="text-sm font-semibold text-foreground mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div 
              className="w-2 h-2 rounded-full" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-medium text-foreground">
              {entry.value?.toLocaleString("de-DE")}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const MetricsChart = ({ data, loading, byProvider = false }: MetricsChartProps) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-6 rounded-2xl backdrop-blur-xl bg-card/60 border border-white/10"
          >
            <div className="h-6 bg-muted/30 rounded w-1/3 mb-2 animate-pulse"></div>
            <div className="h-4 bg-muted/30 rounded w-1/2 mb-6 animate-pulse"></div>
            <div className="h-[300px] bg-muted/20 rounded-xl animate-pulse"></div>
          </motion.div>
        ))}
      </div>
    );
  }

  if (byProvider) {
    // Group by provider
    const providerData = data.reduce((acc, item) => {
      const existing = acc.find(p => p.provider === item.provider);
      if (existing) {
        existing.likes += item.likes || 0;
        existing.views += item.views || 0;
        existing.engagement += item.avg_engagement || 0;
        existing.count += 1;
      } else {
        acc.push({
          provider: item.provider,
          likes: item.likes || 0,
          views: item.views || 0,
          engagement: item.avg_engagement || 0,
          count: 1
        });
      }
      return acc;
    }, [] as any[]);

    // Calculate averages
    providerData.forEach(p => {
      p.avgEngagement = p.count > 0 ? parseFloat((p.engagement / p.count).toFixed(2)) : 0;
    });

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-2xl backdrop-blur-xl bg-card/60 border border-white/10
                     shadow-[0_0_30px_hsla(43,90%,68%,0.08)]"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center
                            bg-gradient-to-br from-primary/20 to-cyan-500/20
                            shadow-[0_0_15px_hsla(43,90%,68%,0.2)]">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Engagement by Platform</h3>
              <p className="text-sm text-muted-foreground">Durchschnittliche Engagement-Rate</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={providerData}>
              <defs>
                <linearGradient id="engagementGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="provider" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar 
                dataKey="avgEngagement" 
                fill="url(#engagementGradient)" 
                name="Engagement Rate %" 
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-6 rounded-2xl backdrop-blur-xl bg-card/60 border border-white/10
                     shadow-[0_0_30px_hsla(190,90%,50%,0.08)]"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center
                            bg-gradient-to-br from-cyan-500/20 to-purple-500/20
                            shadow-[0_0_15px_hsla(190,90%,50%,0.2)]">
              <TrendingUp className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Total Engagement by Platform</h3>
              <p className="text-sm text-muted-foreground">Likes und Views pro Plattform</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={providerData}>
              <defs>
                <linearGradient id="likesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                </linearGradient>
                <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(190, 90%, 50%)" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(190, 90%, 50%)" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="provider" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="likes" fill="url(#likesGradient)" name="Likes" radius={[8, 8, 0, 0]} />
              <Bar dataKey="views" fill="url(#viewsGradient)" name="Views" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
    );
  }

  // Time series data (group by day)
  const timeSeriesData = data.reduce((acc, item) => {
    const day = new Date(item.day).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
    const existing = acc.find(d => d.day === day);
    if (existing) {
      existing.likes += item.likes || 0;
      existing.views += item.views || 0;
    } else {
      acc.push({
        day,
        likes: item.likes || 0,
        views: item.views || 0
      });
    }
    return acc;
  }, [] as any[]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 rounded-2xl backdrop-blur-xl bg-card/60 border border-white/10
                   shadow-[0_0_30px_hsla(43,90%,68%,0.08)]"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center
                          bg-gradient-to-br from-primary/20 to-cyan-500/20
                          shadow-[0_0_15px_hsla(43,90%,68%,0.2)]">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Engagement Over Time</h3>
            <p className="text-sm text-muted-foreground">Views und Likes Trends</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={timeSeriesData}>
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="views" 
              stroke="hsl(var(--primary))" 
              name="Views" 
              strokeWidth={3}
              dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, fill: "hsl(var(--primary))", stroke: "hsl(var(--background))", strokeWidth: 2 }}
              filter="url(#glow)"
            />
            <Line 
              type="monotone" 
              dataKey="likes" 
              stroke="hsl(190, 90%, 50%)" 
              name="Likes" 
              strokeWidth={3}
              dot={{ fill: "hsl(190, 90%, 50%)", strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, fill: "hsl(190, 90%, 50%)", stroke: "hsl(var(--background))", strokeWidth: 2 }}
              filter="url(#glow)"
            />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="p-6 rounded-2xl backdrop-blur-xl bg-card/60 border border-white/10
                   shadow-[0_0_30px_hsla(190,90%,50%,0.08)]"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center
                          bg-gradient-to-br from-cyan-500/20 to-purple-500/20
                          shadow-[0_0_15px_hsla(190,90%,50%,0.2)]">
            <BarChart3 className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Daily Activity</h3>
            <p className="text-sm text-muted-foreground">Engagement-Verteilung pro Tag</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={timeSeriesData}>
            <defs>
              <linearGradient id="dailyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={1} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar 
              dataKey="likes" 
              fill="url(#dailyGradient)" 
              name="Likes" 
              radius={[8, 8, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
};
