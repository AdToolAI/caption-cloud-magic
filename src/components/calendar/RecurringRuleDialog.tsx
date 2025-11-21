import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useRecurringEvents } from '@/hooks/useRecurringEvents';
import { Repeat } from 'lucide-react';

interface RecurringRuleDialogProps {
  workspace_id: string;
  open: boolean;
  onClose: () => void;
}

export function RecurringRuleDialog({ workspace_id, open, onClose }: RecurringRuleDialogProps) {
  const { createRule, loading } = useRecurringEvents(workspace_id);
  const [name, setName] = useState('');
  const [pattern, setPattern] = useState<string>('weekly');
  const [eventTitle, setEventTitle] = useState('');
  const [eventCaption, setEventCaption] = useState('');
  const [autoRender, setAutoRender] = useState(false);
  const [channels, setChannels] = useState<string[]>(['instagram']);

  const handleSubmit = () => {
    if (!name || !eventTitle) return;

    const templateEvent = {
      title: eventTitle,
      caption: eventCaption,
      channels,
      status: 'draft',
    };

    createRule({
      workspace_id,
      name,
      template_event: templateEvent,
      recurrence_pattern: pattern,
      auto_render: autoRender,
    });

    // Reset form
    setName('');
    setPattern('weekly');
    setEventTitle('');
    setEventCaption('');
    setAutoRender(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-5 w-5" />
            Recurring Event erstellen
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label>Regel-Name</Label>
            <Input
              placeholder="z.B. Wöchentlicher Status Update"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <Label>Wiederholungs-Pattern</Label>
            <Select value={pattern} onValueChange={setPattern}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Täglich</SelectItem>
                <SelectItem value="weekly">Wöchentlich</SelectItem>
                <SelectItem value="monthly">Monatlich</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium mb-3">Event-Vorlage</h3>
            
            <div className="space-y-3">
              <div>
                <Label>Event-Titel</Label>
                <Input
                  placeholder="Titel des wiederkehrenden Events"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                />
              </div>

              <div>
                <Label>Caption (optional)</Label>
                <Textarea
                  placeholder="Text für den Post..."
                  value={eventCaption}
                  onChange={(e) => setEventCaption(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-Rendering</Label>
                  <p className="text-sm text-muted-foreground">
                    Video automatisch rendern
                  </p>
                </div>
                <Switch
                  checked={autoRender}
                  onCheckedChange={setAutoRender}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || !name || !eventTitle}
          >
            <Repeat className="h-4 w-4 mr-2" />
            Regel erstellen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
