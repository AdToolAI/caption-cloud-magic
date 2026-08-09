import { tx } from "@/lib/i18nText";
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useRecurringEvents } from '@/hooks/useRecurringEvents';
import { useTranslation } from '@/hooks/useTranslation';
import { Repeat } from 'lucide-react';

interface RecurringRuleDialogProps {
  workspace_id: string;
  open: boolean;
  onClose: () => void;
}

export function RecurringRuleDialog({ workspace_id, open, onClose }: RecurringRuleDialogProps) {
  const { createRule, loading } = useRecurringEvents(workspace_id);
  const { t } = useTranslation();
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
            {tx({ de: "Recurring Event erstellen", en: "Create recurring event", es: "Crear evento recurrente" })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label>{tx({ de: "Regel-Name", en: "Rule name", es: "Nombre de la regla" })}</Label>
            <Input
              placeholder={tx({ de: "z.B. Wöchentlicher Status Update", en: "e.g. Weekly status update", es: "p. ej. Actualización semanal de estado" })}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <Label>{tx({ de: "Wiederholungs-Pattern", en: "Recurrence pattern", es: "Patrón de recurrencia" })}</Label>
            <Select value={pattern} onValueChange={setPattern}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">{tx({ de: "Täglich", en: "Daily", es: "Diario" })}</SelectItem>
                <SelectItem value="weekly">{tx({ de: "Wöchentlich", en: "Weekly", es: "Semanal" })}</SelectItem>
                <SelectItem value="monthly">{tx({ de: "Monatlich", en: "Monthly", es: "Mensual" })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium mb-3">{tx({ de: "Event-Vorlage", en: "Event template", es: "Plantilla de evento" })}</h3>
            
            <div className="space-y-3">
              <div>
                <Label>{tx({ de: "Event-Titel", en: "Event title", es: "Título del evento" })}</Label>
                <Input
                  placeholder={t("calendarRecurring.eventTitle")}
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                />
              </div>

              <div>
                <Label>{tx({ de: "Caption (optional)", en: "Caption (optional)", es: "Leyenda (opcional)" })}</Label>
                <Textarea
                  placeholder={t("calendarRecurring.captionPlaceholder")}
                  value={eventCaption}
                  onChange={(e) => setEventCaption(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>{tx({ de: "Auto-Rendering", en: "Auto rendering", es: "Renderizado automático" })}</Label>
                  <p className="text-sm text-muted-foreground">
                    {tx({ de: "Video automatisch rendern", en: "Automatically render video", es: "Renderizar video automáticamente" })}
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
            {tx({ de: "Abbrechen", en: "Cancel", es: "Cancelar" })}
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || !name || !eventTitle}
          >
            <Repeat className="h-4 w-4 mr-2" />
            {tx({ de: "Regel erstellen", en: "Create rule", es: "Crear regla" })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
