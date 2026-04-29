import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Flag } from 'lucide-react';
import { useReportCharacter } from '@/hooks/useCharacterMarketplace';

const REASONS = [
  { value: 'impersonation', label: 'Impersonation of a real person' },
  { value: 'copyright', label: 'Copyright / trademark infringement' },
  { value: 'minor', label: 'Depicts a minor' },
  { value: 'deepfake', label: 'Malicious deepfake / public figure' },
  { value: 'nsfw', label: 'NSFW content' },
  { value: 'other', label: 'Other' },
];

interface Props {
  character: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CharacterReportDialog({ character, open, onOpenChange }: Props) {
  const [reason, setReason] = useState('impersonation');
  const [description, setDescription] = useState('');
  const report = useReportCharacter();

  if (!character) return null;

  const handleSubmit = async () => {
    if (description.length < 20) return;
    const res = await report.mutateAsync({ characterId: character.id, reason, description: description.trim() });
    if (res.ok) {
      onOpenChange(false);
      setDescription('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Flag className="h-4 w-4" /> Report "{character.name}"</DialogTitle>
          <DialogDescription>Help us keep the marketplace safe. False reports may be subject to legal action.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Description (min. 20 characters)</Label>
            <Textarea rows={5} value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} placeholder="Describe the issue and link any evidence." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={report.isPending || description.length < 20} variant="destructive">
            {report.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
