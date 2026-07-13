import { Link } from "react-router-dom";
import { Crown, ShieldCheck, Percent, Clock, AlertTriangle, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FoundersSlotBadge } from "@/components/pricing/FoundersSlotBadge";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const benefits = [
  {
    icon: ShieldCheck,
    title: "14,99 € Preisgarantie für 24 Monate",
    text: "Dein Beta-Preis bleibt für zwei volle Jahre eingefroren — unabhängig von späteren Preisanpassungen.",
  },
  {
    icon: Percent,
    title: "20 % Rabatt auf alle Video-Credits",
    text: "Automatisch angewendet auf jeden Video-Credit-Kauf, 24 Monate lang. Kein Code nötig.",
  },
  {
    icon: Sparkles,
    title: "Voller Feature-Zugang während der Beta",
    text: "Cast & World, Motion Studio, AI Video Studio, Picture Studio — alles freigeschaltet.",
  },
  {
    icon: Crown,
    title: "Direkter Draht zum Team",
    text: "Priorisiertes Feedback, Early-Access zu neuen Features und persönlicher Support.",
  },
];

export const FoundersBenefitsDialog = ({ open, onOpenChange }: Props) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-background/95 backdrop-blur-xl border-primary/30">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-primary/10 border border-primary/30">
              <Crown className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-2xl font-bold tracking-tight">
              Founders-Programm — Deine Vorteile
            </DialogTitle>
          </div>
          <DialogDescription className="text-base leading-relaxed">
            Wir starten am <strong className="text-foreground">26.07.2026</strong> in eine öffentliche{" "}
            <strong className="text-foreground">3-Monats-Beta</strong>. Als einer der ersten{" "}
            <strong className="text-foreground">1.000 Founders</strong> sicherst du dir dauerhafte Vorteile —
            und hilfst uns, die Plattform gemeinsam großartig zu machen.
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 flex justify-center">
          <FoundersSlotBadge />
        </div>

        <div className="grid gap-3 mt-2">
          {benefits.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="flex gap-3 p-3 rounded-lg border border-border/50 bg-card/50"
            >
              <div className="shrink-0 p-2 rounded-md bg-primary/10 h-fit">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-0.5">
                <div className="font-semibold text-sm text-foreground">{title}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{text}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 flex gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Wichtig:</strong> Der Founder-Status ist an ein aktives
            Abo gebunden. Bei <strong className="text-foreground">Kündigung, Pausierung oder Kontolöschung</strong>{" "}
            geht dein Founder-Status <strong className="text-foreground">dauerhaft verloren</strong> und der Slot wird
            für neue Nutzer freigegeben. Details in unseren{" "}
            <Link to="/legal/terms#section-8" className="text-primary hover:underline">AGB §8</Link>.
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>Beta-Phase: 26.07.2026 – 26.10.2026 · Preisgarantie & Rabatt: 24 Monate ab Signup</span>
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Später
          </Button>
          <Button asChild className="bg-primary hover:bg-primary/90">
            <Link to="/pricing" onClick={() => onOpenChange(false)}>
              <Crown className="h-4 w-4 mr-2" />
              Jetzt Founder werden
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
