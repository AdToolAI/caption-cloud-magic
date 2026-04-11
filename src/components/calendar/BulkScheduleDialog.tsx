import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useBulkScheduling, BulkScheduleEvent } from '@/hooks/useBulkScheduling';
import { CalendarIcon } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface BulkScheduleDialogProps {
  workspace_id: string;
  open: boolean;
  onClose: () => void;
}

export function BulkScheduleDialog({ workspace_id, open, onClose }: BulkScheduleDialogProps) {
  const { t } = useTranslation();
  const { bulkSchedule, loading } = useBulkScheduling();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [strategy, setStrategy] = useState<'even' | 'optimal' | 'manual'>('even');
  const [eventsText, setEventsText] = useState('');

  const handleSubmit = async () => {
    const eventLines = eventsText.split('\n').filter(line => line.trim());
    const events: BulkScheduleEvent[] = eventLines.map(line => ({
      title: line.trim(),
      channels: ['instagram', 'facebook'],
    }));

    if (events.length === 0) return;

    const result = await bulkSchedule({
      workspace_id,
      start_date: startDate,
      end_date: endDate,
      events,
      distribution_strategy: strategy,
    });

    if (result) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('calendar.bulkScheduling')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('calendar.startDate')}</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>{t('calendar.endDate')}</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>{t('calendar.distributionStrategy')}</Label>
            <Select value={strategy} onValueChange={(v: any) => setStrategy(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="even">{t('calendar.distributeEvenly')}</SelectItem>
                <SelectItem value="optimal">{t('calendar.optimalAI')}</SelectItem>
                <SelectItem value="manual">{t('calendar.manualStrategy')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t('calendar.eventsOnePerLine')}</Label>
            <Textarea
              placeholder="Post Title 1&#10;Post Title 2&#10;Post Title 3"
              value={eventsText}
              onChange={(e) => setEventsText(e.target.value)}
              rows={10}
            />
            <p className="text-sm text-muted-foreground mt-1">
              {eventsText.split('\n').filter(l => l.trim()).length} {t('calendar.events')}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('calendar.cancelBtn')}
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !startDate || !endDate || !eventsText.trim()}>
            <CalendarIcon className="h-4 w-4 mr-2" />
            {loading ? t('calendar.planningEvents') : t('calendar.planEvents')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
