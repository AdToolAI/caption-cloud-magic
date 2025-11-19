import { VideoCreation } from '@/types/video';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Download, Share2, Eye, TrendingUp } from 'lucide-react';

interface VersionAnalyticsProps {
  versions: VideoCreation[];
}

export const VersionAnalytics = ({ versions }: VersionAnalyticsProps) => {
  // Calculate analytics data
  const analyticsData = versions.map(v => ({
    name: `v${v.version_number}`,
    downloads: v.download_count || 0,
    shares: v.share_count || 0,
    version: v.version_number,
  })).sort((a, b) => a.version - b.version);

  const bestPerformer = versions.reduce((best, current) => {
    const bestScore = (best.download_count || 0) + (best.share_count || 0);
    const currentScore = (current.download_count || 0) + (current.share_count || 0);
    return currentScore > bestScore ? current : best;
  }, versions[0]);

  const totalDownloads = versions.reduce((sum, v) => sum + (v.download_count || 0), 0);
  const totalShares = versions.reduce((sum, v) => sum + (v.share_count || 0), 0);
  const avgDownloads = totalDownloads / versions.length;
  const avgShares = totalShares / versions.length;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Eye className="h-4 w-4" />
            Versionen
          </div>
          <p className="text-2xl font-bold">{versions.length}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Download className="h-4 w-4" />
            Downloads
          </div>
          <p className="text-2xl font-bold">{totalDownloads}</p>
          <p className="text-xs text-muted-foreground">Ø {avgDownloads.toFixed(1)}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Share2 className="h-4 w-4" />
            Shares
          </div>
          <p className="text-2xl font-bold">{totalShares}</p>
          <p className="text-xs text-muted-foreground">Ø {avgShares.toFixed(1)}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <TrendingUp className="h-4 w-4" />
            Best Performer
          </div>
          <p className="text-2xl font-bold">v{bestPerformer?.version_number}</p>
          <p className="text-xs text-muted-foreground">
            {(bestPerformer?.download_count || 0) + (bestPerformer?.share_count || 0)} Aktionen
          </p>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-medium mb-4">Downloads pro Version</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={analyticsData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="downloads" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-medium mb-4">Shares pro Version</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={analyticsData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="shares" stroke="hsl(var(--primary))" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Version Comparison */}
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-4">Versions-Vergleich</h3>
        <div className="space-y-2">
          {versions.sort((a, b) => (b.download_count || 0) - (a.download_count || 0)).map((version) => {
            const isBest = version.id === bestPerformer?.id;
            const score = (version.download_count || 0) + (version.share_count || 0);
            const maxScore = Math.max(...versions.map(v => (v.download_count || 0) + (v.share_count || 0)));
            const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;

            return (
              <div key={version.id} className="flex items-center gap-4">
                <div className="flex items-center gap-2 min-w-[120px]">
                  <Badge variant={isBest ? "default" : "outline"}>
                    v{version.version_number}
                  </Badge>
                  {isBest && <Badge variant="secondary">Best</Badge>}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground min-w-[60px] text-right">
                      {score} Aktionen
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{version.download_count || 0} Downloads</span>
                    <span>{version.share_count || 0} Shares</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};
