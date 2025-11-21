import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useRecurringEvents } from '@/hooks/useRecurringEvents';
import { Repeat, Trash2, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface RecurringEventsListProps {
  workspace_id: string;
}

export function RecurringEventsList({ workspace_id }: RecurringEventsListProps) {
  const { rules, toggleRule, deleteRule, loading } = useRecurringEvents(workspace_id);

  const getPatternLabel = (pattern: string) => {
    switch (pattern) {
      case 'daily': return 'Täglich';
      case 'weekly': return 'Wöchentlich';
      case 'monthly': return 'Monatlich';
      default: return pattern;
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Lade Recurring Rules...
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-muted-foreground">
            <Repeat className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Keine Recurring Rules</p>
            <p className="text-sm mt-2">
              Erstelle automatisch wiederkehrende Events
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {rules.map((rule) => (
        <Card key={rule.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Repeat className={`h-5 w-5 ${rule.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                <div>
                  <CardTitle className="text-lg">{rule.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {getPatternLabel(rule.recurrence_pattern)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={rule.is_active}
                  onCheckedChange={(checked) => toggleRule({ rule_id: rule.id, is_active: checked })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteRule(rule.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Event-Vorlage:</p>
                <p className="text-sm text-muted-foreground">
                  {(rule.template_event as any)?.title || 'Event'}
                </p>
              </div>

              {rule.auto_render && (
                <Badge variant="secondary">
                  🎬 Auto-Rendering
                </Badge>
              )}

              <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>
                    Nächste Ausführung:{' '}
                    {rule.next_execution
                      ? formatDistanceToNow(new Date(rule.next_execution), {
                          addSuffix: true,
                          locale: de,
                        })
                      : 'Nicht geplant'}
                  </span>
                </div>
                {rule.last_execution && (
                  <span>
                    Letzte Ausführung:{' '}
                    {formatDistanceToNow(new Date(rule.last_execution), {
                      addSuffix: true,
                      locale: de,
                    })}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
