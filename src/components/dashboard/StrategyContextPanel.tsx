import { tx } from "@/lib/i18nText";
import { Badge } from "@/components/ui/badge";
import { MapPin, Sparkles, Lightbulb, TrendingUp, Brain, Target, Clock, Flame } from "lucide-react";
import { format } from "date-fns";
import type { StrategyPost, CreatorLevel } from "@/hooks/useStrategyMode";
import { uiLocale } from '@/lib/uiLocale';

interface Props {
  post: StrategyPost;
  weekPosts: StrategyPost[];
  experienceLevel: CreatorLevel;
  avgEngagementRate?: number;
  postsPublished?: number;
  weekStart: string;
}

const LEVEL_LABEL: Record<CreatorLevel, string> = {
  beginner: tx({ de: "Anfänger", en: "Beginner", es: "Principiante" }),
  intermediate: tx({ de: "Fortgeschritten", en: "Advanced", es: "Avanzado" }),
  advanced: tx({ de: "Profi", en: "Pro", es: "Profesional" }),
};

const PHASE_LABEL_DE: Record<string, string> = {
  Awareness: tx({ de: "Reichweite aufbauen", en: "Build reach", es: "Aumentar alcance" }),
  "Trust Building": tx({ de: "Vertrauen aufbauen", en: "Build trust", es: "Generar confianza" }),
  Conversion: tx({ de: "Aktion auslösen", en: "Trigger action", es: "Activar acción" }),
  Retention: tx({ de: "Bindung stärken", en: "Strengthen bond", es: "Fortalecer vínculo" }),
  Community: tx({ de: "Community aktivieren", en: "Activate community", es: "Activar comunidad" }),
};

const DEFAULT_TIPS_BY_PLATFORM: Record<string, string[]> = {
  instagram: [
    tx({ de: "Erste 3 Sekunden = starker Hook", en: "First 3 seconds = strong hook", es: "Los primeros 3 segundos = gancho fuerte" }),
    tx({ de: "Vertikales Format (9:16) für Reels", en: "Vertical format (9:16) for Reels", es: "Formato vertical (9:16) para Reels" }),
    tx({ de: "1 klare Botschaft pro Post", en: "1 clear message per post", es: "1 mensaje claro por publicación" }),
    tx({ de: "Cross-post in deine Story", en: "Cross-post to your Story", es: "Publica también en tu Historia" }),
  ],
  tiktok: [
    tx({ de: "Trend-Sound nutzen erhöht Reichweite", en: "Using trend sounds increases reach", es: "Usar sonidos de tendencia aumenta el alcance" }),
    tx({ de: "Hook in den ersten 1-2 Sek", en: "Hook in the first 1-2 seconds", es: "Gancho en los primeros 1-2 segundos" }),
    tx({ de: "Native Captions on-screen", en: "Native captions on-screen", es: "Subtítulos nativos en pantalla" }),
    tx({ de: "Hochkant 9:16 immer", en: "Vertical 9:16 always", es: "Siempre vertical 9:16" }),
  ],
  linkedin: [
    tx({ de: "Persönliche Story > Werbung", en: "Personal story > Advertising", es: "Historia personal > Publicidad" }),
    tx({ de: "Erste 2 Zeilen entscheiden über „Mehr anzeigen“", en: "First 2 lines decide about „Show more“", es: "Las primeras 2 líneas deciden sobre „Ver más“" }),
    tx({ de: "Frage am Ende fördert Kommentare", en: "Question at the end encourages comments", es: "La pregunta al final fomenta los comentarios" }),
    tx({ de: "Native Video > YouTube-Link", en: "Native video > YouTube link", es: "Video nativo > enlace de YouTube" }),
  ],
  facebook: [
    tx({ de: "Bilder > Links für Reichweite", en: "Images > Links for reach", es: "Imágenes > Enlaces para alcance" }),
    tx({ de: "Frage in der Caption für Engagement", en: "Question in the caption for engagement", es: "Pregunta en el pie de foto para generar interacción" }),
    tx({ de: "Posts mit 80–120 Zeichen performen am besten", en: "Posts with 80–120 characters perform best", es: "Las publicaciones con 80–120 caracteres funcionan mejor" }),
  ],
  youtube: [
    tx({ de: "Thumbnail entscheidet über CTR", en: "Thumbnail decides CTR", es: "La miniatura decide el CTR" }),
    tx({ de: "Erste 15 Sek = Retention", en: "First 15 seconds = Retention", es: "Primeros 15 segundos = Retención" }),
    tx({ de: "End-Screen für nächstes Video nutzen", en: "Use the end screen for the next video", es: "Usa la pantalla final para el próximo video" }),
  ],
  x: [
    tx({ de: "Knapp und scharf, max. 200 Zeichen", en: "Short and sharp, max. 200 characters", es: "Corto y directo, máx. 200 caracteres" }),
    tx({ de: "Thread für komplexe Themen", en: "Thread for complex topics", es: "Hilo para temas complejos" }),
    tx({ de: "1 Bild erhöht Engagement um 35%", en: "1 image increases engagement by 35%", es: "1 imagen aumenta el engagement en un 35%" }),
  ],
  twitter: [
    tx({ de: "Knapp und scharf, max. 200 Zeichen", en: "Short and sharp, max. 200 characters", es: "Corto y directo, máx. 200 caracteres" }),
    tx({ de: "Thread für komplexe Themen", en: "Thread for complex topics", es: "Hilo para temas complejos" }),
  ],
};

export function StrategyContextPanel({
  post,
  weekPosts,
  experienceLevel,
  avgEngagementRate,
  postsPublished,
  weekStart,
}: Props) {
  const sortedWeek = [...weekPosts].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );
  const postIndex = sortedWeek.findIndex((p) => p.id === post.id);
  const totalInWeek = sortedWeek.length;

  const phaseDe = post.phase ? PHASE_LABEL_DE[post.phase] || post.phase : null;
  const platformKey = post.platform.toLowerCase();
  const tips = post.tips && post.tips.length > 0
    ? post.tips
    : (DEFAULT_TIPS_BY_PLATFORM[platformKey] || DEFAULT_TIPS_BY_PLATFORM.instagram);

  const weekDate = new Date(weekStart);
  const weekLabel = weekDate.toLocaleDateString(uiLocale(), { day: "numeric", month: "long" });

  return (
    <div className="space-y-3">
      {/* Wo du gerade stehst */}
      <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-3">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-primary uppercase tracking-wide">
          <MapPin className="h-3.5 w-3.5" /> {tx({ de: "Wo du gerade stehst", en: "Where you are right now", es: "Dónde estás ahora" })}
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">{tx({ de: "Post in der Woche", en: "Post of the week", es: "Publicación de la semana" })}</div>
            <div className="font-semibold">
              {postIndex >= 0 ? `${postIndex + 1} von ${totalInWeek}` : `— / ${totalInWeek}`}
            </div>
            <div className="text-[11px] text-muted-foreground">{tx({ de: "Woche ab", en: "Week from", es: "Semana desde" })} {weekLabel}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">{tx({ de: "Dein Level", en: "Your level", es: "Tu nivel" })}</div>
            <div className="font-semibold">{LEVEL_LABEL[experienceLevel]}</div>
            {typeof avgEngagementRate === "number" && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Ø ER {avgEngagementRate.toFixed(1)}%
              </div>
            )}
          </div>
        </div>
        {phaseDe && (
          <div className="mt-2 flex items-center gap-1.5">
            <Target className="h-3 w-3 text-primary" />
            <span className="text-[11px] text-muted-foreground">Phase:</span>
            <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
              {phaseDe}
            </Badge>
          </div>
        )}
      </div>

      {/* Warum diese Uhrzeit? — Slot-Score aus der Posting-Times-Engine */}
      {(typeof post.slot_score === "number" && post.slot_score > 0) && (
        <div className="rounded-lg border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-3">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Clock className="h-3.5 w-3.5" /> {tx({ de: "Warum diese Uhrzeit?", en: "Why this time?", es: "¿Por qué a esta hora?" })}
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex flex-col items-center justify-center rounded-md bg-primary/15 px-2.5 py-1.5 min-w-[58px]">
              <div className="text-[9px] text-muted-foreground uppercase leading-none">Score</div>
              <div className="text-lg font-bold text-primary leading-tight">{post.slot_score}</div>
              <div className="text-[9px] text-muted-foreground leading-none">/ 100</div>
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold flex items-center gap-1.5">
                {format(new Date(post.scheduled_at), "EEEE, HH:mm", { locale: dateFnsLocale() })}
                {post.slot_score >= 85 && <Flame className="h-3.5 w-3.5 text-warning" />}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {post.slot_score >= 85
                  ? tx({ de: "Top-Slot deiner Heatmap", en: "Top slot of your heatmap", es: "Slot superior de tu mapa de calor" })
                  : post.slot_score >= 70
                  ? tx({ de: "Starker Slot — sehr gute Wahl", en: "Strong slot — very good choice", es: "Slot fuerte — muy buena elección" })
                  : post.slot_score >= 55
                  ? tx({ de: "Solider Slot", en: "Solid slot", es: "Slot sólido" })
                  : tx({ de: "Optimierbar — siehe Heatmap", en: "Can be optimized — see heatmap", es: "Optimizable — ver mapa de calor" })}
              </div>
            </div>
          </div>
          {post.slot_reason && post.slot_reason.length > 0 && (
            <ul className="space-y-1 pt-2 border-t border-primary/20">
              {post.slot_reason.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-foreground/85">
                  <span className="mt-1 h-1 w-1 rounded-full bg-primary shrink-0" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Die Idee */}
      <div className="rounded-lg border border-border/50 bg-card/40 p-3">
        <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Lightbulb className="h-3.5 w-3.5 text-warning" /> {tx({ de: "Die Idee", en: "The idea", es: "La idea" })}
        </div>
        <p className="text-sm font-semibold">{post.content_idea}</p>
        {post.reasoning && (
          <div className="mt-2 pt-2 border-t border-border/40">
            <div className="text-[10px] text-muted-foreground uppercase mb-1">{tx({ de: "Warum genau dieser Post?", en: "Why exactly this post?", es: "¿Por qué exactamente este post?" })}</div>
            <p className="text-xs text-muted-foreground italic leading-relaxed">{post.reasoning}</p>
          </div>
        )}
      </div>

      {/* Tipps für maximale Wirkung */}
      <div className="rounded-lg border border-border/50 bg-card/40 p-3">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> {tx({ de: "Tipps für maximale Wirkung", en: "Tips for maximum impact", es: "Consejos para el máximo impacto" })}
        </div>
        <ul className="space-y-1.5">
          {tips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <span className="text-foreground/90">{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Was die KI über dich weiß */}
      {(typeof postsPublished === "number" || typeof avgEngagementRate === "number") && (
        <div className="rounded-lg border border-border/50 bg-card/40 p-3">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Brain className="h-3.5 w-3.5 text-primary" /> {tx({ de: "Was die KI über dich weiß", en: "What the AI knows about you", es: "Lo que la IA sabe de ti" })}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {typeof postsPublished === "number" && (
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">{tx({ de: "Veröffentlicht (28 T)", en: "Published (28 d)", es: "Publicado (28 d)" })}</div>
                <div className="font-semibold">{postsPublished}</div>
              </div>
            )}
            {typeof avgEngagementRate === "number" && (
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">{tx({ de: "Ø Engagement", en: "Avg engagement", es: "Promedio de participación" })}</div>
                <div className="font-semibold">{avgEngagementRate.toFixed(2)}%</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
