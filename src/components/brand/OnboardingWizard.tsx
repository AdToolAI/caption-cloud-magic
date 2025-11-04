import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";
import { useAuth } from "@/hooks/useAuth";

interface WizardData {
  brandName: string;
  targetAudience: string;
  brandValues: string[];
  stylePreference: string;
  primaryColor: string;
  tonePreference: string;
}

interface OnboardingWizardProps {
  onComplete: (data: WizardData) => void;
  onSkip: () => void;
}

const valueOptions = [
  "Vertrauenswürdig", "Innovativ", "Nachhaltig", "Professionell", 
  "Kreativ", "Authentisch", "Luxuriös", "Freundlich"
];

const styleOptions = [
  { value: "minimalist", label: "Minimalistisch", emoji: "⚪" },
  { value: "luxurious", label: "Luxuriös", emoji: "✨" },
  { value: "playful", label: "Verspielt", emoji: "🎨" },
  { value: "urban", label: "Urban", emoji: "🏙️" },
  { value: "modern", label: "Modern", emoji: "🚀" },
  { value: "elegant", label: "Elegant", emoji: "💎" }
];

const toneOptions = [
  "seriös", "frech", "inspirierend", "professionell", "freundlich", "mutig"
];

export function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    brandName: "",
    targetAudience: "",
    brandValues: [],
    stylePreference: "",
    primaryColor: "#6366F1",
    tonePreference: ""
  });

  const totalSteps = 5;
  const progress = (step / totalSteps) * 100;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      // Track brand kit creation
      trackEvent(ANALYTICS_EVENTS.BRAND_KIT_CREATED, {
        brand_name: data.brandName,
        target_audience: data.targetAudience,
        brand_values: data.brandValues?.join(', '),
        style: data.stylePreference,
        tone: data.tonePreference,
        source: 'onboarding_wizard',
        user_id: user?.id
      });
      onComplete(data);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const toggleValue = (value: string) => {
    setData(prev => ({
      ...prev,
      brandValues: prev.brandValues.includes(value)
        ? prev.brandValues.filter(v => v !== value)
        : [...prev.brandValues, value]
    }));
  };

  const canProceed = () => {
    switch (step) {
      case 1: return data.brandName.trim().length > 0;
      case 2: return data.targetAudience.trim().length > 0;
      case 3: return data.brandValues.length > 0;
      case 4: return data.stylePreference.length > 0;
      case 5: return data.tonePreference.length > 0;
      default: return false;
    }
  };

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-2xl">
        <CardHeader>
          <div className="flex items-center justify-between mb-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <Button variant="ghost" size="sm" onClick={onSkip}>
              Überspringen
            </Button>
          </div>
          <CardTitle className="text-2xl">Marken-Identität erstellen</CardTitle>
          <CardDescription>
            Schritt {step} von {totalSteps}
          </CardDescription>
          <Progress value={progress} className="mt-2" />
        </CardHeader>

        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <Label htmlFor="brandName">Wie heißt deine Marke? *</Label>
                <Input
                  id="brandName"
                  value={data.brandName}
                  onChange={(e) => setData({ ...data, brandName: e.target.value })}
                  placeholder="z.B. Fashion Studio Berlin"
                  className="mt-2"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <Label htmlFor="audience">Wer ist deine Zielgruppe? *</Label>
                <Textarea
                  id="audience"
                  value={data.targetAudience}
                  onChange={(e) => setData({ ...data, targetAudience: e.target.value })}
                  placeholder="z.B. Junge Frauen 25-35, Mode-bewusst, Urban Lifestyle"
                  rows={4}
                  className="mt-2"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <Label>Welche Werte & Emotionen verkörpert deine Marke? *</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Wähle mindestens einen Wert
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {valueOptions.map(value => (
                    <Badge
                      key={value}
                      variant={data.brandValues.includes(value) ? "default" : "outline"}
                      className="cursor-pointer py-2 px-4 justify-center hover:scale-105 transition-transform"
                      onClick={() => toggleValue(value)}
                    >
                      {value}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <Label>Welche Stilrichtung passt zu deiner Marke? *</Label>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {styleOptions.map(style => (
                    <Card
                      key={style.value}
                      className={`cursor-pointer transition-all hover:scale-105 ${
                        data.stylePreference === style.value
                          ? "border-primary ring-2 ring-primary"
                          : "border-border"
                      }`}
                      onClick={() => setData({ ...data, stylePreference: style.value })}
                    >
                      <CardContent className="p-4 text-center">
                        <div className="text-3xl mb-2">{style.emoji}</div>
                        <p className="font-medium">{style.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <Label>Welche Tonalität soll deine Marke haben? *</Label>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {toneOptions.map(tone => (
                    <Badge
                      key={tone}
                      variant={data.tonePreference === tone ? "default" : "outline"}
                      className="cursor-pointer py-2 px-4 justify-center hover:scale-105 transition-transform"
                      onClick={() => setData({ ...data, tonePreference: tone })}
                    >
                      {tone}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="color">Deine Hauptfarbe</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    id="color"
                    type="color"
                    value={data.primaryColor}
                    onChange={(e) => setData({ ...data, primaryColor: e.target.value })}
                    className="w-20 h-12"
                  />
                  <Input
                    type="text"
                    value={data.primaryColor}
                    onChange={(e) => setData({ ...data, primaryColor: e.target.value })}
                    className="flex-1 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={step === 1}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Zurück
            </Button>

            <Button
              onClick={handleNext}
              disabled={!canProceed()}
            >
              {step === totalSteps ? (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Marken-Set erstellen
                </>
              ) : (
                <>
                  Weiter
                  <ChevronRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
