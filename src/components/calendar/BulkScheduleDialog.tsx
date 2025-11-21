import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useBulkScheduling, BulkScheduleEvent } from '@/hooks/useBulkScheduling';
import { CalendarIcon, Upload } from 'lucide-react';

interface BulkScheduleDialogProps {
  workspace_id: string;
  open: boolean;
  onClose: () => void;
}

export function BulkScheduleDialog({ workspace_id, open, onClose }: BulkScheduleDialogProps) {
  const { bulkSchedule, loading } = useBulkScheduling();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [strategy, setStrategy] = useState<'even' | 'optimal' | 'manual'>('even');
  const [eventsText, setEventsText] = useState('');

  const handleSubmit = async () => {
    // Parse events from text (one per line)
    const eventLines = eventsText.split('\n').filter(line => line.trim());
    const events: BulkScheduleEvent[] = eventLines.map(line => ({
      title: line.trim(),
      channels: ['instagram', 'facebook'],
    }));

    if (events.length === 0) {
      return;
    }

    const result = await bulkSchedule({
      workspace_id,
      start_date: startDate,
      end_date: endDate,
      events,
      distribution_strategy: strategy,
    });

    if (result) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Scheduling</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Startdatum</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Enddatum</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Verteilungs-Strategie</Label>
            <Select value={strategy} onValueChange={(v: any) => setStrategy(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="even">Gleichmäßig verteilen</SelectItem>
                <SelectItem value="optimal">Optimal (AI-basiert)</SelectItem>
                <SelectItem value="manual">Manuell</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Events (ein Event pro Zeile)</Label>
            <Textarea
              placeholder="Post Titel 1&#10;Post Titel 2&#10;Post Titel 3"
              value={eventsText}
              onChange={(e) => setEventsText(e.target.value)}
              rows={10}
            />
            <p className="text-sm text-muted-foreground mt-1">
              {eventsText.split('\n').filter(l => l.trim()).length} Events
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !startDate || !endDate || !eventsText.trim()}>
            <CalendarIcon className="h-4 w-4 mr-2" />
            {loading ? 'Plane...' : 'Events planen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
