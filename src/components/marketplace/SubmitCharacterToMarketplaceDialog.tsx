import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Coins, Gift, Sparkles, UserCheck, IdCard, ShieldAlert, Loader2, Upload } from 'lucide-react';
import { useSubmitCharacterToMarketplace } from '@/hooks/useCharacterMarketplace';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';

const REVENUE_SHARE = 70;

type Origin = 'ai_generated' | 'licensed_real_person' | 'self_portrait';

const CONSENT_KEYS = [
  { key: 'ownership_rights', label: 'I own all rights to the image, voice and identity material of this character.' },
  { key: 'model_release_or_ai', label: 'If a real person is depicted, I have a valid model release including the right to commercial sub-licensing. AI-generated characters do not depict real people.' },
  { key: 'no_public_figures', label: 'This character does not depict any public figure (politician, celebrity, brand mascot, fictional IP) without explicit written authorisation.' },
  { key: 'not_minor', label: 'This character is not, and does not appear to be, a minor (under 18).' },
  { key: 'accept_creator_terms', label: 'I have read and accept the Marketplace Creator Terms.' },
  { key: 'accept_liability', label: 'I accept full liability for false declarations, including account suspension, take-down, and full refund of all earnings.' },
];

interface Character {
  id: string;
  name: string;
}

interface Props {
  character: Character | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubmitCharacterToMarketplaceDialog({ character, open, onOpenChange }: Props) {
  const [step, setStep] = useState(1);
  const [pricingType, setPricingType] = useState<'free' | 'premium'>('free');
  const [priceCredits, setPriceCredits] = useState(100);
  const [originType, setOriginType] = useState<Origin>('ai_generated');
  const [aiTool, setAiTool] = useState('Picture Studio');
  const [personName, setPersonName] = useState('');
  const [personCountry, setPersonCountry] = useState('');
  const [licensePath, setLicensePath] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [tags, setTags] = useState('');
  const [consents, setConsents] = useState<Record<string, boolean>>({});

  const submit = useSubmitCharacterToMarketplace();
  const { toast } = useToast();

  const allConsented = CONSENT_KEYS.every(c => consents[c.key]);
  const creatorEarning = Math.floor(priceCredits * REVENUE_SHARE / 100);
  const platformFee = priceCredits - creatorEarning;

  const reset = () => {
    setStep(1); setPricingType('free'); setPriceCredits(100); setOriginType('ai_generated');
    setAiTool('Picture Studio'); setPersonName(''); setPersonCountry(''); setLicensePath(''); setTags(''); setConsents({});
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  if (!character) return null;

  const handleLicenseUpload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast({ title: 'PDF required', description: 'Model releases must be uploaded as PDF.', variant: 'destructive' });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: 'Too large', description: 'Max 8 MB.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) throw new Error('Not signed in');
      const path = `${u.user.id}/${character.id}/release.pdf`;
      const { error } = await supabase.storage.from('character-licenses').upload(path, file, { upsert: true, contentType: 'application/pdf' });
      if (error) throw error;
      setLicensePath(path);
      toast({ title: 'Release uploaded', description: 'Stored privately. Only admins and you can access it.' });
    } catch (e) {
      toast({ title: 'Upload failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const canProceedFromOrigin =
    (originType === 'ai_generated' && aiTool.length > 0) ||
    (originType === 'licensed_real_person' && licensePath && personName.length > 1) ||
    (originType === 'self_portrait');

  const handleSubmit = async () => {
    const originMetadata: Record<string, unknown> = originType === 'ai_generated'
      ? { ai_tool: aiTool }
      : originType === 'licensed_real_person'
        ? { person_name: personName, person_country: personCountry }
        : { self_portrait: true };

    const res = await submit.mutateAsync({
      characterId: character.id,
      pricingType,
      priceCredits: pricingType === 'free' ? 0 : priceCredits,
      originType,
      originMetadata,
      licenseReleasePath: licensePath || undefined,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 12),
      consents,
    });
    if (res.ok) handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publish "{character.name}" to the Marketplace</DialogTitle>
          <DialogDescription>Step {step} of 4 · 70/30 revenue share · Strict legal safeguards</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><Coins className="h-4 w-4" /> Pricing</h3>
            <RadioGroup value={pricingType} onValueChange={v => setPricingType(v as 'free' | 'premium')} className="gap-3">
              <Label htmlFor="p-free" className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="free" id="p-free" className="mt-1" />
                <div><div className="flex items-center gap-2 font-medium"><Gift className="h-4 w-4 text-emerald-500" />Free</div>
                <p className="text-xs text-muted-foreground mt-1">Build reputation, collect ratings. Auto-published if AI-generated.</p></div>
              </Label>
              <Label htmlFor="p-prem" className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="premium" id="p-prem" className="mt-1" />
                <div><div className="flex items-center gap-2 font-medium"><Coins className="h-4 w-4 text-amber-500" />Premium</div>
                <p className="text-xs text-muted-foreground mt-1">Earn {REVENUE_SHARE}% per sale. Requires admin review.</p></div>
              </Label>
            </RadioGroup>

            {pricingType === 'premium' && (
              <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label>Price: <span className="font-bold">{priceCredits} credits</span></Label>
                  <span className="text-xs text-muted-foreground">25 – 1000</span>
                </div>
                <Slider min={25} max={1000} step={25} value={[priceCredits]} onValueChange={([v]) => setPriceCredits(v)} />
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-md p-2">
                    <div className="text-xs text-muted-foreground">You earn per sale</div>
                    <div className="font-bold text-emerald-600 dark:text-emerald-400">{creatorEarning}</div>
                  </div>
                  <div className="bg-muted rounded-md p-2">
                    <div className="text-xs text-muted-foreground">Platform fee</div>
                    <div className="font-bold">{platformFee}</div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="tags">Tags (comma-separated, max 12)</Label>
              <Input id="tags" value={tags} onChange={e => setTags(e.target.value)} placeholder="business, female, 30s, brunette, european" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-amber-500" /> Origin Wall — Mandatory</h3>
            <p className="text-xs text-muted-foreground">You must declare exactly one origin category. False declarations carry full personal liability.</p>

            <RadioGroup value={originType} onValueChange={v => setOriginType(v as Origin)} className="gap-2">
              <Label htmlFor="o-ai" className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="ai_generated" id="o-ai" className="mt-1" />
                <div><div className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4 text-violet-500" />AI-Generated</div>
                <p className="text-xs text-muted-foreground mt-1">This person does not exist in real life. Recommended path.</p></div>
              </Label>
              <Label htmlFor="o-real" className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="licensed_real_person" id="o-real" className="mt-1" />
                <div><div className="flex items-center gap-2 font-medium"><IdCard className="h-4 w-4 text-amber-500" />Licensed Real Person</div>
                <p className="text-xs text-muted-foreground mt-1">A real person — model release PDF required.</p></div>
              </Label>
              <Label htmlFor="o-self" className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="self_portrait" id="o-self" className="mt-1" />
                <div><div className="flex items-center gap-2 font-medium"><UserCheck className="h-4 w-4 text-cyan-500" />Self-Portrait</div>
                <p className="text-xs text-muted-foreground mt-1">I am the depicted person.</p></div>
              </Label>
            </RadioGroup>

            {originType === 'ai_generated' && (
              <div>
                <Label htmlFor="ai-tool">AI tool used</Label>
                <Input id="ai-tool" value={aiTool} onChange={e => setAiTool(e.target.value)} placeholder="Picture Studio / Midjourney / Flux / DALL·E" />
              </div>
            )}
            {originType === 'licensed_real_person' && (
              <div className="space-y-3 border rounded-lg p-3 bg-amber-500/5 border-amber-500/30">
                <div>
                  <Label htmlFor="pn">Full name of depicted person *</Label>
                  <Input id="pn" value={personName} onChange={e => setPersonName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="pc">Country of jurisdiction</Label>
                  <Input id="pc" value={personCountry} onChange={e => setPersonCountry(e.target.value)} placeholder="DE, US, …" />
                </div>
                <div>
                  <Label>Model Release (PDF, max 8MB) *</Label>
                  <div className="mt-1">
                    <input type="file" accept="application/pdf" id="release-upload" className="hidden" onChange={e => e.target.files?.[0] && handleLicenseUpload(e.target.files[0])} />
                    <Button variant="outline" size="sm" type="button" disabled={uploading} onClick={() => document.getElementById('release-upload')?.click()}>
                      {uploading ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Upload className="h-3 w-3 mr-2" />}
                      {licensePath ? 'Replace PDF' : 'Upload PDF'}
                    </Button>
                    {licensePath && <span className="ml-3 text-xs text-emerald-500">✓ Uploaded</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Stored in private bucket — only you and admins can access.</p>
                </div>
              </div>
            )}
            {originType === 'self_portrait' && (
              <p className="text-xs text-muted-foreground">By selecting self-portrait you confirm you are the depicted person and accept commercial sub-licensing through the marketplace.</p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <h3 className="font-semibold flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-destructive" /> Legal Confirmations</h3>
            <p className="text-xs text-muted-foreground">Each checkbox is mandatory. Your acceptance is recorded with timestamp, IP hash and user agent.</p>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
              {CONSENT_KEYS.map(c => (
                <label key={c.key} className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
                  <Checkbox checked={!!consents[c.key]} onCheckedChange={(v) => setConsents(s => ({ ...s, [c.key]: !!v }))} />
                  <span className="text-sm">{c.label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Read the full <Link to="/legal/marketplace-creator-terms" target="_blank" className="underline">Creator Terms</Link>.
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <h3 className="font-semibold">Review &amp; Submit</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="border rounded p-2"><div className="text-xs text-muted-foreground">Pricing</div><div className="font-medium">{pricingType === 'free' ? 'Free' : `${priceCredits} credits`}</div></div>
              <div className="border rounded p-2"><div className="text-xs text-muted-foreground">Origin</div><div className="font-medium">{originType.replace('_', ' ')}</div></div>
              <div className="border rounded p-2 col-span-2"><div className="text-xs text-muted-foreground">After submit</div><div className="font-medium">{pricingType === 'free' && originType === 'ai_generated' ? 'Auto-published' : 'Pending admin review'}</div></div>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between gap-2">
          <Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : handleClose(false)}>
            {step > 1 ? 'Back' : 'Cancel'}
          </Button>
          {step < 4 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={(step === 2 && !canProceedFromOrigin) || (step === 3 && !allConsented)}
            >
              Next
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submit.isPending || !allConsented}>
              {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {pricingType === 'free' && originType === 'ai_generated' ? 'Publish now' : 'Submit for review'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
