import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Check, TrendingUp, ShoppingCart, Palette } from "lucide-react";
import { tx, useTx } from "@/lib/i18nText";

const goals = [
  { id: "grow_audience", label: tx({ de: "Reichweite aufbauen", en: "Build reach", es: "Aumentar el alcance" }), icon: TrendingUp, desc: tx({ de: "Videos, die neue Zuschauer erreichen", en: "Videos that reach new viewers", es: "Vídeos que llegan a nuevos espectadores" }) },
  { id: "sell_products", label: tx({ de: "Werbevideos produzieren", en: "Produce advertising videos", es: "Producir videos publicitarios" }), icon: ShoppingCart, desc: tx({ de: "Ads, die Produkte verkaufen", en: "Ads that sell products", es: "Anuncios que venden productos" }) },
  { id: "build_brand", label: tx({ de: "Marke inszenieren", en: "Stage brand", es: "Escenificar marca" }), icon: Palette, desc: tx({ de: "Wiedererkennbarer Cast & Look in jedem Video", en: "Recognizable cast & look in every video", es: "Reparto y apariencia reconocibles en cada video" }) },
];

const levels = [
  { id: "beginner", label: tx({ de: "Anfänger", en: "Beginner", es: "Principiante" }), desc: tx({ de: "Erste eigene Videoproduktion", en: "First own video production", es: "Primera producción de video propia" }) },
  { id: "intermediate", label: tx({ de: "Fortgeschritten", en: "Intermediate", es: "Avanzado" }), desc: tx({ de: "Produziert regelmäßig, will optimieren", en: "Produces regularly, wants to optimize", es: "Produce regularmente, quiere optimizar" }) },
  { id: "advanced", label: tx({ de: "Profi", en: "Pro", es: "Profesional" }), desc: tx({ de: "Erfahren, sucht Skalierung", en: "Experienced, looking for scaling", es: "Experimentado, busca escalabilidad" }) },
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
  const tx = useTx();
  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-center">{tx({ de: "Was ist dein Hauptziel?", en: "What is your main goal?", es: "¿Cuál es tu objetivo principal?" })}</h3>

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
        <Label>tx({ de: "Veröffentlichungen pro Woche:", en: "Posts per week:", es: "Publicaciones por semana:" }) <span className="font-bold text-primary">{postsPerWeek}</span></Label>
        <Slider
          value={[postsPerWeek]}
          onValueChange={(v) => onPostsPerWeekChange(v[0])}
          min={3}
          max={7}
          step={1}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{tx({ de: "3 (entspannt)", en: "3 (relaxed)", es: "3 (relajado)" })}</span>
          <span>{tx({ de: "5 (regelmäßig)", en: "5 (regular)", es: "5 (regular)" })}</span>
          <span>{tx({ de: "7 (intensiv)", en: "7 (intensive)", es: "7 (intensivo)" })}</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label>{tx({ de: "Erfahrungslevel", en: "Experience level", es: "Nivel de experiencia" })}</Label>
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
        <Button onClick={onBack} variant="outline" size="lg" className="w-full">{tx({ de: "Zurück", en: "Back", es: "Atrás" })}</Button>
        <Button onClick={onNext} size="lg" className="w-full" disabled={!postingGoal || !experienceLevel}>
          tx({ de: "Weiter", en: "Continue", es: "Siguiente" })
        </Button>
      </div>
    </div>
  );
}
