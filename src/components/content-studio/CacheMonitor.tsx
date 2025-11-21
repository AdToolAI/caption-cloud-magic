import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Trash2, RefreshCw, Database, TrendingUp } from 'lucide-react';
import { templateCache } from '@/lib/template-cache';
import { performanceMonitor } from '@/utils/performance';

export const CacheMonitor = () => {
  const [stats, setStats] = useState(templateCache.getStats());
  const [cacheSize, setCacheSize] = useState(templateCache.size());
  const [cacheKeys, setCacheKeys] = useState<string[]>([]);
  const [perfMetrics, setPerfMetrics] = useState<any>(null);

  useEffect(() => {
    updateStats();
    const interval = setInterval(updateStats, 2000);
    return () => clearInterval(interval);
  }, []);

  const updateStats = () => {
    setStats(templateCache.getStats());
    setCacheSize(templateCache.size());
    setCacheKeys(templateCache.keys());
    setPerfMetrics(performanceMonitor.getAllMetrics());
  };

  const handleClearCache = () => {
    templateCache.clear();
    updateStats();
  };

  const handleCleanExpired = () => {
    const cleaned = templateCache.cleanExpired();
    console.log(`Cleaned ${cleaned} expired entries`);
    updateStats();
  };

  const handleResetStats = () => {
    templateCache.resetStats();
    performanceMonitor.reset();
    updateStats();
  };

  const hitRatePercent = Math.round(stats.hitRate * 100);
  const maxSize = 100;
  const sizePercent = Math.round((cacheSize / maxSize) * 100);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Cache Monitor</h2>
            <p className="text-sm text-muted-foreground">
              Template-System Cache-Status und Performance-Metriken
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCleanExpired}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Abgelaufen bereinigen
            </Button>
            <Button variant="outline" size="sm" onClick={handleResetStats}>
              <TrendingUp className="h-4 w-4 mr-2" />
              Stats zurücksetzen
            </Button>
            <Button variant="destructive" size="sm" onClick={handleClearCache}>
              <Trash2 className="h-4 w-4 mr-2" />
              Cache leeren
            </Button>
          </div>
        </div>

        {/* Cache Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Cache Hits</div>
            <div className="text-2xl font-bold text-green-600">{stats.hits}</div>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Cache Misses</div>
            <div className="text-2xl font-bold text-red-600">{stats.misses}</div>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Hit Rate</div>
            <div className="text-2xl font-bold">{hitRatePercent}%</div>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Cache-Einträge</div>
            <div className="text-2xl font-bold">{cacheSize}</div>
          </div>
        </div>

        {/* Hit Rate Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Hit Rate</span>
            <span className="text-sm text-muted-foreground">{hitRatePercent}%</span>
          </div>
          <Progress value={hitRatePercent} className="h-2" />
        </div>

        {/* Cache Size Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Cache-Größe</span>
            <span className="text-sm text-muted-foreground">
              {cacheSize} / {maxSize} ({sizePercent}%)
            </span>
          </div>
          <Progress value={sizePercent} className="h-2" />
        </div>

        {/* Cache Operations */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-muted/50 rounded">
            <div className="text-xs text-muted-foreground">Sets</div>
            <div className="text-xl font-semibold">{stats.sets}</div>
          </div>
          <div className="p-3 bg-muted/50 rounded">
            <div className="text-xs text-muted-foreground">Invalidierungen</div>
            <div className="text-xl font-semibold">{stats.invalidations}</div>
          </div>
        </div>
      </Card>

      {/* Cache Keys */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Database className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Cached Keys</h3>
          <Badge variant="secondary">{cacheKeys.length}</Badge>
        </div>
        
        {cacheKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Cache-Einträge vorhanden</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-auto">
            {cacheKeys.map((key, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm"
              >
                <code className="text-xs">{key}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    templateCache.invalidate(key);
                    updateStats();
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Performance Metrics */}
      {perfMetrics && Object.keys(perfMetrics).length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Performance-Metriken</h3>
          </div>
          
          <div className="space-y-4">
            {Object.entries(perfMetrics).map(([name, metrics]: [string, any]) => (
              metrics && (
                <div key={name} className="border-l-2 border-primary pl-4">
                  <div className="font-medium text-sm mb-2">{name}</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Count:</span>
                      <span className="ml-2 font-semibold">{metrics.count}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Avg:</span>
                      <span className="ml-2 font-semibold">{metrics.avg.toFixed(2)}ms</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Min:</span>
                      <span className="ml-2 font-semibold">{metrics.min.toFixed(2)}ms</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Max:</span>
                      <span className="ml-2 font-semibold">{metrics.max.toFixed(2)}ms</span>
                    </div>
                  </div>
                </div>
              )
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
