import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Building2, Camera, Users, Briefcase } from "lucide-react";

const businessTypes = [
  { id: "creator", label: "Creator", icon: Camera, desc: "Content Creator / Influencer" },
  { id: "agency", label: "Agentur", icon: Users, desc: "Social Media Agentur" },
  { id: "smb", label: "KMU", icon: Building2, desc: "Kleines / Mittleres Unternehmen" },
  { id: "freelancer", label: "Freelancer", icon: Briefcase, desc: "Selbstständig / Freiberufler" },
];

const nicheSuggestions = [
  "Fitness", "E-Commerce", "Fotografie", "Food & Rezepte", "Mode & Fashion",
  "Tech & Gadgets", "Reisen", "Beauty & Skincare", "Coaching", "Handwerk & DIY",
  "Immobilien", "Musik", "Bildung", "Gaming", "Gesundheit",
];

interface NicheStepProps {
  businessType: string;
  niche: string;
  onBusinessTypeChange: (type: string) => void;
  onNicheChange: (niche: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function NicheStep({ businessType, niche, onBusinessTypeChange, onNicheChange, onNext, onBack }: NicheStepProps) {
  const [showAllNiches, setShowAllNiches] = useState(false);
  const displayedNiches = showAllNiches ? nicheSuggestions : nicheSuggestions.slice(0, 8);

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-center">Was beschreibt dich am besten?</h3>
      
      <div className="grid grid-cols-2 gap-3">
        {businessTypes.map((bt) => {
          const Icon = bt.icon;
          return (
            <Card
              key={bt.id}
              className={`cursor-pointer transition-all hover:shadow-lg ${
                businessType === bt.id ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => onBusinessTypeChange(bt.id)}
            >
              <CardContent className="flex flex-col items-center justify-center p-4 text-center">
                <Icon className="h-8 w-8 mb-2 text-primary" />
                <span className="font-semibold">{bt.label}</span>
                <span className="text-xs text-muted-foreground">{bt.desc}</span>
                {businessType === bt.id && <Check className="h-4 w-4 text-primary mt-1" />}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-2">
        <Label>Deine Nische / Branche</Label>
        <Input
          value={niche}
          onChange={(e) => onNicheChange(e.target.value)}
          placeholder="z.B. Fitness, E-Commerce, Fotografie..."
        />
        <div className="flex flex-wrap gap-2 mt-2">
          {displayedNiches.map((n) => (
            <button
              key={n}
              onClick={() => onNicheChange(n)}
              className={`px-3 py-1 text-sm rounded-full border transition-all ${
                niche === n
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted border-border hover:border-primary"
              }`}
            >
              {n}
            </button>
          ))}
          {!showAllNiches && (
            <button
              onClick={() => setShowAllNiches(true)}
              className="px-3 py-1 text-sm rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground"
            >
              +{nicheSuggestions.length - 8} mehr
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <Button onClick={onBack} variant="outline" size="lg" className="w-full">Zurück</Button>
        <Button onClick={onNext} size="lg" className="w-full" disabled={!businessType || !niche}>
          Weiter
        </Button>
      </div>
    </div>
  );
}
