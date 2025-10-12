import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Clock, CheckCircle, XCircle, AlertCircle, Trash2 } from "lucide-react";

export function QueueManagement() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      loadQueue();
    }
  }, [user]);

  const loadQueue = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('auto_post_queue')
      .select('*')
      .order('scheduled_at', { ascending: true });
    
    setQueueItems(data || []);
  };

  const deleteQueueItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from('auto_post_queue')
        .delete()
        .eq('id', id);

      if (error) throw error;

      loadQueue();
      toast({
        title: t('scheduler.queueItemDeleted'),
        description: t('scheduler.queueItemDeletedDescription'),
      });
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const retryFailedItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from('auto_post_queue')
        .update({ 
          status: 'pending',
          attempts: 0,
          error_message: null
        })
        .eq('id', id);

      if (error) throw error;

      loadQueue();
      toast({
        title: t('scheduler.retryScheduled'),
        description: t('scheduler.retryScheduledDescription'),
      });
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: any = {
      pending: "secondary",
      completed: "default",
      failed: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{t(`scheduler.status.${status}`)}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('scheduler.postQueue')}</CardTitle>
        <CardDescription>{t('scheduler.queueDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {queueItems.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {t('scheduler.noQueuedPosts')}
            </p>
          ) : (
            queueItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3 flex-1">
                  {getStatusIcon(item.status)}
                  <div className="flex-1">
                    <p className="font-medium capitalize">{item.platform}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(item.scheduled_at).toLocaleString()}
                    </p>
                    {item.error_message && (
                      <p className="text-xs text-red-500 mt-1">{item.error_message}</p>
                    )}
                  </div>
                  {getStatusBadge(item.status)}
                </div>
                <div className="flex gap-2">
                  {item.status === 'failed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => retryFailedItem(item.id)}
                    >
                      {t('scheduler.retry')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteQueueItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}