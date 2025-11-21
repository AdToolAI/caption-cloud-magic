import { useTemplateCollaboration } from '@/hooks/useTemplateCollaboration';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface TemplateActivityFeedProps {
  templateId: string;
}

export const TemplateActivityFeed = ({ templateId }: TemplateActivityFeedProps) => {
  const { activity } = useTemplateCollaboration(templateId);

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      'UPDATE': 'Aktualisiert',
      'INSERT': 'Erstellt',
      'DELETE': 'Gelöscht',
    };
    return labels[action] || action;
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">Aktivitätsprotokoll</h3>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-3">
          {activity?.map((item) => (
            <div key={item.id} className="flex gap-3 p-3 bg-muted rounded-lg">
              <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-sm font-medium text-foreground">
                    {getActionLabel(item.action)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(item.created_at), {
                      addSuffix: true,
                      locale: de,
                    })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Benutzer: {item.user_id.slice(0, 8)}
                </p>
              </div>
            </div>
          ))}

          {activity?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Keine Aktivitäten vorhanden
            </p>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
};
