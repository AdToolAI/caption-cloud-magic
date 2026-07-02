import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Users, ShieldCheck, Scissors, Sparkles } from "lucide-react";

const STORAGE_KEY = "udc.welcome.seen.v1";

const features = [
  { icon: Lock, title: "Voice-Lock", body: "Lock voice, language & tone per project so every scene sounds identical." },
  { icon: Users, title: "Anchor-Refresh", body: "Character identity stays consistent — detects drift and snaps scenes to your master face." },
  { icon: ShieldCheck, title: "CI-Preflight", body: "Aspect, endcard, loudness & brand contrast checked before export. Failures block render." },
  { icon: Scissors, title: "Auto Cut-Down", body: "Generate 15s and 6s ad variants from your master. Hook & payoff preserved automatically." },
];

export function UDCWelcomeDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        // slight delay so it doesn't fight with editor mount
        const t = setTimeout(() => setOpen(true), 800);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);

  const close = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="inline-flex items-center gap-2 text-primary text-xs font-medium mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            Universal Directors Cut
          </div>
          <DialogTitle className="text-2xl font-serif">Consistency-First editing, in 4 tools.</DialogTitle>
          <DialogDescription>
            UDC keeps your character, voice, and brand identical across every scene — so you can ship ad variants without re-recording anything.
          </DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-3 py-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-border/60 bg-card/40 p-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{body}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close}>Skip</Button>
          <Button onClick={close}>Start editing</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UDCWelcomeDialog;
