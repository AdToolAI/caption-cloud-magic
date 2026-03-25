import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Check, TrendingUp, ShoppingCart, Palette } from "lucide-react";

const goals = [
  { id: "grow_audience", label: "Reichweite aufbauen", icon: TrendingUp, desc: "Mehr Follower & Engagement gewinnen" },
  { id: "sell_products", label: "Produkte verkaufen", icon: ShoppingCart, desc: "Umsatz über Social Media steigern" },
  { id: "build_brand", label: "Marke stärken", icon: Palette, desc: "Wiedererkennungswert & Vertrauen aufbauen" },
];

const levels = [
  { id: "beginner", label: "Anfänger", desc: "Erste Schritte im Social Media" },
  { id: "intermediate", label: "Fortgeschritten", desc: "Regelmäßig aktiv, will optimieren" },
  { id: "advanced", label: "Profi", desc: "Erfahren, sucht Skalierung" },
];

interface GoalsStepProps {
  postingGoal: string;
  postsPerWeek: number;
  experienceLevel: string;
  onGoalChange: (goal: string) => void;
  onPostsPerWeekChange: (n: number) => void;
  onExperienceChange: (level: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function GoalsStep({
  postingGoal, postsPerWeek, experienceLevel,
  onGoalChange, onPostsPerWeekChange, onExperienceChange,
  onNext, onBack,
}: GoalsStepProps) {
  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-center">Was ist dein Hauptziel?</h3>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {goals.map((g) => {
          const Icon = g.icon;
          return (
            <Card
              key={g.id}
              className={`cursor-pointer transition-all hover:shadow-lg ${
                postingGoal === g.id ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => onGoalChange(g.id)}
            >
              <CardContent className="flex flex-col items-center text-center p-4">
                <Icon className="h-7 w-7 text-primary mb-2" />
                <span className="font-semibold text-sm">{g.label}</span>
                <span className="text-xs text-muted-foreground">{g.desc}</span>
                {postingGoal === g.id && <Check className="h-4 w-4 text-primary mt-1" />}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-3">
        <Label>Posts pro Woche: <span className="font-bold text-primary">{postsPerWeek}</span></Label>
        <Slider
          value={[postsPerWeek]}
          onValueChange={(v) => onPostsPerWeekChange(v[0])}
          min={3}
          max={7}
          step={1}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>3 (entspannt)</span>
          <span>5 (regelmäßig)</span>
          <span>7 (intensiv)</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Erfahrungslevel</Label>
        <div className="grid grid-cols-3 gap-2">
          {levels.map((l) => (
            <button
              key={l.id}
              onClick={() => onExperienceChange(l.id)}
              className={`p-3 rounded-xl border text-center transition-all ${
                experienceLevel === l.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <span className="text-sm font-medium block">{l.label}</span>
              <span className="text-xs text-muted-foreground">{l.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <Button onClick={onBack} variant="outline" size="lg" className="w-full">Zurück</Button>
        <Button onClick={onNext} size="lg" className="w-full" disabled={!postingGoal || !experienceLevel}>
          Weiter
        </Button>
      </div>
    </div>
  );
}
