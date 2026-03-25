import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Instagram, Music, Linkedin, Facebook, Twitter } from "lucide-react";

const platformOptions = [
  { id: "instagram", label: "Instagram", icon: Instagram, color: "text-pink-500" },
  { id: "tiktok", label: "TikTok", icon: Music, color: "text-foreground" },
  { id: "linkedin", label: "LinkedIn", icon: Linkedin, color: "text-blue-700 dark:text-blue-500" },
  { id: "facebook", label: "Facebook", icon: Facebook, color: "text-blue-600" },
  { id: "x", label: "X (Twitter)", icon: Twitter, color: "text-foreground" },
];

interface PlatformStepProps {
  selectedPlatforms: string[];
  onToggle: (platform: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function PlatformStep({ selectedPlatforms, onToggle, onNext, onBack }: PlatformStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold">Auf welchen Plattformen bist du aktiv?</h3>
        <p className="text-sm text-muted-foreground mt-1">Wähle mindestens eine Plattform aus</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {platformOptions.map((p) => {
          const Icon = p.icon;
          const selected = selectedPlatforms.includes(p.id);
          return (
            <Card
              key={p.id}
              className={`cursor-pointer transition-all hover:shadow-lg ${
                selected ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => onToggle(p.id)}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className={`h-6 w-6 ${p.color}`} />
                <span className="font-medium flex-1">{p.label}</span>
                {selected && <Check className="h-5 w-5 text-primary" />}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-4">
        <Button onClick={onBack} variant="outline" size="lg" className="w-full">Zurück</Button>
        <Button onClick={onNext} size="lg" className="w-full" disabled={selectedPlatforms.length === 0}>
          Weiter
        </Button>
      </div>
    </div>
  );
}
