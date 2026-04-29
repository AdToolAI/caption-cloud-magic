import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const REASONS = [
  { value: 'impersonation', label: 'This depicts me / a real person without consent' },
  { value: 'copyright', label: 'Copyright / trademark infringement' },
  { value: 'minor', label: 'This depicts a minor' },
  { value: 'deepfake', label: 'Malicious deepfake / public figure' },
  { value: 'nsfw', label: 'Sexually explicit / NSFW content' },
  { value: 'other', label: 'Other concern' },
];

export default function CharacterTakedownRequest() {
  const { toast } = useToast();
  const [characterId, setCharacterId] = useState('');
  const [reporterEmail, setReporterEmail] = useState('');
  const [reason, setReason] = useState('impersonation');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!characterId.trim() || !reporterEmail.trim() || description.length < 20) {
      toast({ title: 'Please complete all required fields', description: 'Character ID, your contact email, and a description (at least 20 characters) are required.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('report-marketplace-character', {
        body: {
          characterId: characterId.trim(),
          reporterEmail: reporterEmail.trim(),
          reason,
          description: description.trim(),
        },
      });
      if (error) throw error;
      if ((data as { ok?: boolean })?.ok) {
        setSubmitted(true);
        toast({ title: 'Report submitted', description: 'Our trust & safety team will review within 48 hours.' });
      } else {
        throw new Error((data as { error?: string })?.error || 'Failed');
      }
    } catch (err) {
      toast({ title: 'Could not submit report', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Character Take-Down Request | AdTool</title>
        <meta name="description" content="Report a Marketplace character that infringes your rights or platform policies." />
      </Helmet>
      <div className="container mx-auto max-w-2xl py-10 px-4">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <header className="flex items-start gap-3 mb-8">
          <AlertTriangle className="h-8 w-8 text-amber-500 mt-1" />
          <div>
            <h1 className="text-3xl font-bold">Character Take-Down Request</h1>
            <p className="text-sm text-muted-foreground mt-1">No account required. We respond within 48 hours.</p>
          </div>
        </header>

        {submitted ? (
          <div className="border rounded-lg p-6 bg-emerald-500/10 border-emerald-500/30 flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0 mt-1" />
            <div>
              <h2 className="font-bold mb-1">Report received</h2>
              <p className="text-sm text-muted-foreground">High-severity reports (impersonation, minor, deepfake) automatically place the character under investigation pending admin review. We will contact you at <strong>{reporterEmail}</strong>.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="cid">Character ID *</Label>
              <Input id="cid" value={characterId} onChange={e => setCharacterId(e.target.value)} placeholder="e.g. 8e97f8e1-59d6-4796-9a44-4c05ca0bfc66" />
              <p className="text-xs text-muted-foreground mt-1">Find the ID on the character's detail page (visible in the URL or via "Report" button).</p>
            </div>
            <div>
              <Label htmlFor="email">Your email *</Label>
              <Input id="email" type="email" value={reporterEmail} onChange={e => setReporterEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <Label>Reason *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="desc">Description * (min. 20 characters)</Label>
              <Textarea id="desc" rows={6} value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} placeholder="Please describe the issue, link to evidence, and provide proof of rights ownership if applicable." />
              <p className="text-xs text-muted-foreground mt-1">{description.length}/2000</p>
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit report
            </Button>
            <p className="text-xs text-muted-foreground">Submitting a knowingly false report may result in legal liability. Your IP and timestamp are recorded.</p>
          </form>
        )}
      </div>
    </>
  );
}
