import { useState } from "react";
import { tx } from "@/lib/i18nText";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Building2, Camera, Users, Briefcase } from "lucide-react";

const businessTypes = [
  { id: "creator", label: "Creator", icon: Camera, desc: tx({ de: "Content Creator / Influencer", en: "Content creator / Influencer", es: "Creador de contenido / Influencer" }) },
  { id: "agency", label: tx({ de: "Agentur", en: "Agency", es: "Agencia" }), icon: Users, desc: tx({ de: "Social Media Agentur", en: "Social media agency", es: "Agencia de redes sociales" }) },
  { id: "smb", label: tx({ de: "KMU", en: "SMB", es: "PyME" }), icon: Building2, desc: tx({ de: "Kleines / Mittleres Unternehmen", en: "Small / medium business", es: "Pequeña / Mediana empresa" }) },
  { id: "freelancer", label: "Freelancer", icon: Briefcase, desc: tx({ de: "Selbstständig / Freiberufler", en: "Self-employed / Freelancer", es: "Autónomo / Freelancer" }) },
];

const nicheSuggestions = [
  tx({ de: "Fitness", en: "Fitness", es: "Fitness" }),
  tx({ de: "E-Commerce", en: "E-Commerce", es: "E-Commerce" }),
  tx({ de: "Fotografie", en: "Photography", es: "Fotografía" }),
  tx({ de: "Food & Rezepte", en: "Food & Recipes", es: "Comida y recetas" }),
  tx({ de: "Mode & Fashion", en: "Fashion", es: "Moda" }),
  tx({ de: "Tech & Gadgets", en: "Tech & Gadgets", es: "Tecnología y gadgets" }),
  tx({ de: "Reisen", en: "Travel", es: "Viajes" }),
  tx({ de: "Beauty & Skincare", en: "Beauty & Skincare", es: "Belleza y cuidado de la piel" }),
  tx({ de: "Coaching", en: "Coaching", es: "Coaching" }),
  tx({ de: "Handwerk & DIY", en: "Crafts & DIY", es: "Manualidades y bricolaje" }),
  tx({ de: "Immobilien", en: "Real Estate", es: "Bienes raíces" }),
  tx({ de: "Musik", en: "Music", es: "Música" }),
  tx({ de: "Bildung", en: "Education", es: "Educación" }),
  tx({ de: "Gaming", en: "Gaming", es: "Gaming" }),
  tx({ de: "Gesundheit", en: "Health", es: "Salud" }),
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
      <h3 className="text-xl font-semibold text-center">{tx({ de: "Was beschreibt dich am besten?", en: "What describes you best?", es: "¿Qué te describe mejor?" })}</h3>
      
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
        <Label>{tx({ de: "Deine Nische / Branche", en: "Your niche / industry", es: "Tu nicho / industria" })}</Label>
        <Input
          value={niche}
          onChange={(e) => onNicheChange(e.target.value)}
          placeholder={tx({ de: "z.B. Fitness, E-Commerce, Fotografie...", en: "e.g. Fitness, E-Commerce, Photography...", es: "p. ej. Fitness, E-Commerce, Fotografía..." })}
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
              +{nicheSuggestions.length - 8} {tx({ de: "mehr", en: "more", es: "más" })}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <Button onClick={onBack} variant="outline" size="lg" className="w-full">{tx({ de: "Zurück", en: "Back", es: "Atrás" })}</Button>
        <Button onClick={onNext} size="lg" className="w-full" disabled={!businessType || !niche}>
          {tx({ de: "Weiter", en: "Next", es: "Siguiente" })}
        </Button>
      </div>
    </div>
  );
}
