import { Camera, Sparkles, Zap } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

const COPY = {
  en: {
    badge: "+60% faster",
    title: "Tickets with a screenshot or screen recording are resolved 60% faster on average.",
    sub: "One image or 30s clip usually replaces 10 messages back-and-forth.",
    urgent: "Without a visual we often cannot reproduce this case — please attach a screenshot or recording.",
  },
  de: {
    badge: "+60% schneller",
    title: "Tickets mit Screenshot oder Screen-Recording werden im Schnitt 60 % schneller gelöst.",
    sub: "Ein Bild oder 30-Sek-Clip spart meist 10 Nachrichten hin und her.",
    urgent: "Ohne Visual können wir diesen Fall meist nicht reproduzieren — bitte Screenshot oder Recording anhängen.",
  },
  es: {
    badge: "+60% más rápido",
    title: "Los tickets con captura o grabación de pantalla se resuelven un 60 % más rápido de media.",
    sub: "Una imagen o un clip de 30s suele ahorrar 10 mensajes de ida y vuelta.",
    urgent: "Sin un visual no podemos reproducir este caso — adjunta una captura o grabación.",
  },
} as const;

interface Props {
  variant?: "compact" | "hero";
  urgent?: boolean;
}

export function EvidenceBoostBanner({ variant = "compact", urgent = false }: Props) {
  const { language } = useTranslation();
  const t = COPY[(language as keyof typeof COPY)] || COPY.en;

  if (urgent) {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-3">
        <Zap className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
        <div className="text-xs text-red-100/90">{t.urgent}</div>
      </div>
    );
  }

  if (variant === "hero") {
    return (
      <div className="relative rounded-xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4 overflow-hidden">
        <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-primary/20 blur-2xl" />
        <div className="relative flex items-start gap-3">
          <div className="rounded-lg bg-primary/20 p-2 border border-primary/30">
            <Camera className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] uppercase tracking-wider font-mono text-primary font-semibold">
                {t.badge}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground leading-snug">{t.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{t.sub}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
      <Zap className="h-4 w-4 text-primary shrink-0" />
      <p className="text-xs text-foreground/85 flex-1">{t.title}</p>
      <span className="text-[10px] uppercase tracking-wider font-mono text-primary font-semibold shrink-0 hidden sm:inline">
        {t.badge}
      </span>
    </div>
  );
}
