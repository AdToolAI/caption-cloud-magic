import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Trash2, Filter } from 'lucide-react';
import { templateLogger, LogEntry, LogLevel } from '@/lib/template-logger';

export const LogViewer = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<LogLevel | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all');

  useEffect(() => {
    // Initial load
    updateLogs();

    // Update logs every 2 seconds
    const interval = setInterval(updateLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    filterLogs();
  }, [logs, selectedLevel, selectedCategory]);

  const updateLogs = () => {
    const recentLogs = templateLogger.getRecentLogs(200);
    setLogs(recentLogs);
  };

  const filterLogs = () => {
    let filtered = logs;

    if (selectedLevel !== 'all') {
      filtered = filtered.filter(log => log.level === selectedLevel);
    }

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(log => log.category === selectedCategory);
    }

    setFilteredLogs(filtered);
  };

  const handleClearLogs = () => {
    templateLogger.clearLogs();
    updateLogs();
  };

  const handleExportLogs = () => {
    const json = templateLogger.exportLogs();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template-logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getCategories = () => {
    const categories = new Set(logs.map(log => log.category));
    return ['all', ...Array.from(categories)];
  };

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case 'debug':
        return 'bg-muted text-muted-foreground';
      case 'info':
        return 'bg-blue-500/10 text-blue-500';
      case 'warn':
        return 'bg-yellow-500/10 text-yellow-500';
      case 'error':
        return 'bg-red-500/10 text-red-500';
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Template System Logs</h2>
            <p className="text-sm text-muted-foreground">
              {filteredLogs.length} von {logs.length} Einträgen
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportLogs}>
              <Download className="h-4 w-4 mr-2" />
              Exportieren
            </Button>
            <Button variant="outline" size="sm" onClick={handleClearLogs}>
              <Trash2 className="h-4 w-4 mr-2" />
              Löschen
            </Button>
          </div>
        </div>

        <Tabs defaultValue="all" onValueChange={(v) => setSelectedLevel(v as LogLevel | 'all')}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all">Alle</TabsTrigger>
            <TabsTrigger value="debug">Debug</TabsTrigger>
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="warn">Warnungen</TabsTrigger>
            <TabsTrigger value="error">Fehler</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Kategorie:</span>
          <div className="flex flex-wrap gap-2">
            {getCategories().map(category => (
              <Badge
                key={category}
                variant={selectedCategory === category ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </Badge>
            ))}
          </div>
        </div>

        <ScrollArea className="h-[600px] rounded-lg border">
          <div className="p-4 space-y-2">
            {filteredLogs.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                Keine Logs vorhanden
              </div>
            ) : (
              filteredLogs.map((log, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <Badge className={getLevelColor(log.level)}>
                      {log.level.toUpperCase()}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold">{log.category}</span>
                        <span className="text-xs text-muted-foreground">
                          {log.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm">{log.message}</p>
                      {log.metadata && (
                        <details className="mt-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            Metadata anzeigen
                          </summary>
                          <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {logs.filter(l => l.level === 'error').length > 0 && (
          <Card className="p-4 bg-destructive/5 border-destructive/20">
            <h3 className="font-semibold mb-2">Fehler-Zusammenfassung</h3>
            <div className="space-y-1">
              {templateLogger.getErrorSummary().map((item, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span>{item.category}</span>
                  <Badge variant="destructive">{item.count}</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </Card>
  );
};
