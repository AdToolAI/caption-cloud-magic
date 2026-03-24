import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle2, XCircle, AlertCircle, Clock, RefreshCw, ExternalLink, Inbox } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface PublishLog {
  id: string;
  at: string;
  level: string;
  message: string;
  meta: any;
}

interface CalendarEvent {
  id: string;
  title: string;
  caption: string;
  channels: string[];
  status: string;
  attempt_no: number;
  next_retry_at: string | null;
  publish_results: any;
  error: any;
  start_at: string;
}

export function PublishingStatusPanel({ workspaceId }: { workspaceId: string }) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const { data: activeEvents, refetch: refetchEvents } = useQuery({
    queryKey: ['calendar-publishing-queue', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('workspace_id', workspaceId)
        .in('status', ['queued', 'failed'])
        .order('start_at', { ascending: true })
        .limit(20);

      if (error) throw error;
      return data as CalendarEvent[];
    },
    refetchInterval: 5000,
  });

  const { data: logs } = useQuery({
    queryKey: ['calendar-publish-logs', selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return [];
      
      const { data, error } = await supabase
        .from('calendar_publish_logs')
        .select('*')
        .eq('event_id', selectedEventId)
        .order('at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as PublishLog[];
    },
    enabled: !!selectedEventId,
  });

  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase
      .channel('publishing-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calendar_events',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          refetchEvents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, refetchEvents]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'published':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      queued: { variant: "default", label: "In Warteschlange" },
      published: { variant: "secondary", label: "Veröffentlicht" },
      failed: { variant: "destructive", label: "Fehlgeschlagen" },
    };
    const c = config[status] || { variant: "outline" as const, label: status };
    return (
      <Badge variant={c.variant} className={status === 'queued' ? 'animate-pulse' : ''}>
        {c.label}
      </Badge>
    );
  };

  const handleRetry = async (eventId: string) => {
    try {
      const { error } = await supabase
        .from('calendar_events')
        .update({
          status: 'scheduled',
          attempt_no: 0,
          next_retry_at: null,
          locked_by: null,
          locked_at: null,
        })
        .eq('id', eventId);

      if (error) throw error;

      toast.success('Event wird erneut verarbeitet');
      refetchEvents();
    } catch (error) {
      console.error('Error retrying event:', error);
      toast.error('Erneuter Versuch fehlgeschlagen');
    }
  };

  if (!activeEvents || activeEvents.length === 0) {
    return (
      <Card className="backdrop-blur-xl bg-card/40 border-white/10">
        <CardHeader>
          <CardTitle className="text-lg">Veröffentlichungs-Warteschlange</CardTitle>
        </CardHeader>
        <CardContent>
          <motion.div 
            className="flex flex-col items-center justify-center py-8 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="p-4 rounded-2xl bg-primary/10 border border-primary/20 mb-4"
            >
              <Inbox className="h-8 w-8 text-primary/60" />
            </motion.div>
            <p className="text-sm text-muted-foreground">Keine aktiven Veröffentlichungen</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Geplante Posts erscheinen hier automatisch</p>
          </motion.div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Queue List */}
      <Card className="backdrop-blur-xl bg-card/40 border-white/10">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Veröffentlichungs-Warteschlange
            <Badge variant="outline" className="border-primary/30">{activeEvents.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {activeEvents.map((event, index) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`p-3 border rounded-lg cursor-pointer hover:bg-accent/30 transition-all duration-200 ${
                    selectedEventId === event.id ? 'bg-accent/30 border-primary/30' : 'border-white/10'
                  }`}
                  onClick={() => setSelectedEventId(event.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusIcon(event.status)}
                        <span className="font-medium text-sm truncate">
                          {event.title || 'Unbenannter Post'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mb-2">
                        {event.caption}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {getStatusBadge(event.status)}
                        {event.channels.map((channel) => (
                          <Badge key={channel} variant="outline" className="text-xs border-white/10">
                            {channel}
                          </Badge>
                        ))}
                        {event.attempt_no > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            Versuch {event.attempt_no}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {event.status === 'failed' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="hover:bg-primary/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetry(event.id);
                        }}
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {event.error && (
                    <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive">
                      <AlertCircle className="h-3 w-3 inline mr-1" />
                      {event.error.message || 'Veröffentlichung fehlgeschlagen'}
                    </div>
                  )}
                  {event.next_retry_at && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Nächster Versuch: {new Date(event.next_retry_at).toLocaleString('de-DE')}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Logs Panel */}
      <Card className="backdrop-blur-xl bg-card/40 border-white/10">
        <CardHeader>
          <CardTitle className="text-lg">
            {selectedEventId ? 'Veröffentlichungs-Logs' : 'Event auswählen'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedEventId && logs ? (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-2 rounded-lg text-xs ${
                      log.level === 'error'
                        ? 'bg-destructive/10 text-destructive'
                        : log.level === 'warn'
                        ? 'bg-yellow-500/10 text-yellow-600'
                        : 'bg-muted/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-medium mb-1">{log.message}</div>
                        <div className="text-muted-foreground">
                          {new Date(log.at).toLocaleString('de-DE')}
                        </div>
                        {log.meta?.results && (
                          <div className="mt-2 space-y-1">
                            {Object.entries(log.meta.results).map(([platform, result]: [string, any]) => (
                              <div key={platform} className="flex items-center gap-2">
                                <Badge variant={result.ok ? "secondary" : "destructive"} className="text-xs">
                                  {platform}
                                </Badge>
                                {result.permalink && (
                                  <a
                                    href={result.permalink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline flex items-center gap-1"
                                  >
                                    Anzeigen <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                                {result.error_message && (
                                  <span className="text-destructive">{result.error_message}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground">
              Wähle ein Event um Logs anzuzeigen
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
