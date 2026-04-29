import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BUYER_LICENSE_VERSION } from '@/pages/legal/MarketplaceBuyerTerms';
import type { MarketplaceCharacter } from '@/hooks/useCharacterMarketplace';

interface Props {
  character: MarketplaceCharacter | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
}

export function BuyerLicenseAcceptDialog({ character, open, onOpenChange, onConfirm, pending }: Props) {
  const [accepted, setAccepted] = useState(false);

  if (!character) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setAccepted(false); onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Accept Buyer License</DialogTitle>
          <DialogDescription>
            License version <code className="text-xs">{BUYER_LICENSE_VERSION}</code> · {character.pricing_type === 'free' ? 'Free' : `${character.price_credits} credits`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="border rounded-lg p-3 bg-muted/30 max-h-60 overflow-y-auto text-xs space-y-2">
            <p><strong>Permitted:</strong> use this character within AdTool to create videos, images, voice content for your own commercial and non-commercial use; publish outputs on your own channels.</p>
            <p><strong>Prohibited:</strong> reselling the bare character; malicious deepfakes; impersonating real persons without consent; sexually explicit content; defamation; illegal use.</p>
            <p><strong>Compliance:</strong> you are responsible for EU AI Act labelling, GDPR, advertising standards in jurisdictions where you publish.</p>
            <p>Read the full <Link to="/legal/marketplace-buyer-terms" target="_blank" className="underline">Buyer License</Link>.</p>
          </div>
          <label className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
            <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(!!v)} />
            <span className="text-sm">I have read and accept the Buyer License. I understand my acceptance is recorded with timestamp and IP hash.</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onConfirm} disabled={!accepted || pending}>
            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {character.pricing_type === 'free' ? 'Unlock for free' : `Pay ${character.price_credits} credits`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
