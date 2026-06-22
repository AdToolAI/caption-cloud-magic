import { AlertTriangle, RotateCw, ArrowLeft } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";

/**
 * StageStoryboardError — Bond-2028 cinematic panel shown on the Storyboard
 * tab when `compose-video-storyboard` failed or returned 0 scenes. Same
 * visual language as StageStoryboardLoader, but with a clear error message
 * and a one-click retry that keeps the user in the Storyboard context.
 *
 * Pure presentation. The retry callback is owned by the dashboard, which
 * re-invokes the same generation pipeline used by BriefingTab.
 */

type Lang = "de" | "en" | "es";

const COPY: Record<Lang, {
  eyebrow: string;
  title: string;
  subtitle: string;
  hintsTitle: string;
  hints: string[];
  retry: string;
  back: string;
  errorPrefix: string;
  retryableHint: string;
}> = {
  de: {
    eyebrow: "REEL · GENERATION FAILED",
    title: "Storyboard konnte nicht erstellt werden",
    subtitle:
      "Die Storyboard-Generierung ist nicht durchgelaufen. Dein Briefing ist unverändert gespeichert — du kannst es entweder direkt erneut starten oder zurück ins Briefing wechseln, um Details anzupassen.",
    hintsTitle: "Mögliche Ursachen",
    hints: [
      "Das KI-Gateway war kurz überlastet — ein erneuter Versuch in 20–30 Sekunden klappt meistens.",
      "Das Briefing enthält evtl. zu wenig Substanz für ein vollständiges Storyboard. Mehr Kontext (USPs, Zielgruppe, Tonalität) hilft deutlich.",
      "Sehr viele Charaktere oder sehr lange Skripte können Timeouts auslösen — reduziere ggf. die Cast-Größe oder die Video-Länge.",
    ],
    retry: "Erneut versuchen",
    back: "Zurück zum Briefing",
    errorPrefix: "Fehler",
    retryableHint: "Wiederholbar — KI-Dienst meldet temporäre Auslastung.",
  },
  en: {
    eyebrow: "REEL · GENERATION FAILED",
    title: "Storyboard could not be generated",
    subtitle:
      "The storyboard generation did not complete. Your briefing is still saved — you can retry directly or go back to the briefing to adjust details.",
    hintsTitle: "Possible causes",
    hints: [
      "The AI gateway was briefly overloaded — retrying in 20–30 seconds usually succeeds.",
      "Your briefing may not have enough substance for a full storyboard. More context (USPs, audience, tone) helps a lot.",
      "Very large casts or very long scripts can trigger timeouts — try reducing cast size or video length.",
    ],
    retry: "Try again",
    back: "Back to briefing",
    errorPrefix: "Error",
    retryableHint: "Retryable — AI service reports temporary overload.",
  },
  es: {
    eyebrow: "REEL · GENERATION FAILED",
    title: "No se pudo generar el storyboard",
    subtitle:
      "La generación del storyboard no se completó. Tu briefing sigue guardado — puedes reintentarlo directamente o volver al briefing para ajustar detalles.",
    hintsTitle: "Causas posibles",
    hints: [
      "El gateway de IA estuvo brevemente saturado — reintentar en 20–30 segundos suele funcionar.",
      "Tu briefing puede no tener suficiente contexto para un storyboard completo. Más detalle (USPs, audiencia, tono) ayuda mucho.",
      "Reparto muy grande o guiones muy largos pueden causar timeouts — reduce el reparto o la duración del vídeo.",
    ],
    retry: "Reintentar",
    back: "Volver al briefing",
    errorPrefix: "Error",
    retryableHint: "Reintentable — el servicio de IA reporta saturación temporal.",
  },
};

interface StageStoryboardErrorProps {
  error: { message: string; retryable?: boolean } | null;
  onRetry?: () => void;
  onBackToBriefing?: () => void;
  isRetrying?: boolean;
}

export default function StageStoryboardError({
  error,
  onRetry,
  onBackToBriefing,
  isRetrying = false,
}: StageStoryboardErrorProps) {
  const { language } = useTranslation();
  const lang: Lang = (["de", "en", "es"] as Lang[]).includes(language as Lang)
    ? (language as Lang)
    : "de";
  const copy = COPY[lang];
  const retryable = error?.retryable === true;

  return (
    <section
      className="relative overflow-hidden rounded-2xl"
      style={{
        background:
          "radial-gradient(circle at 50% 0%, hsla(0,75%,55%,0.10) 0%, transparent 55%), linear-gradient(180deg, #0a0805 0%, #050816 100%)",
        boxShadow: `
          inset 0 1px 0 hsla(43,90%,82%,0.18),
          inset 0 0 0 1px hsla(43,90%,68%,0.16),
          0 0 0 1px hsla(0,75%,55%,0.28),
          0 32px 80px -28px hsla(0,75%,55%,0.30),
          0 12px 32px -14px hsla(0,0%,0%,0.7)
        `,
        minHeight: 480,
      }}
      role="alert"
      aria-live="assertive"
    >
      {/* Cinemascope bars */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-10 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, hsla(0,0%,0%,0.9) 0%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-10 pointer-events-none"
        style={{
          background:
            "linear-gradient(0deg, hsla(0,0%,0%,0.95) 0%, transparent 100%)",
        }}
      />

      {/* Faint film grain */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.7'/></svg>\")",
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center px-6 pt-16 pb-10 gap-7">
        {/* Eyebrow */}
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: "hsl(0,75%,60%)",
              boxShadow: "0 0 12px hsl(0 75% 55% / 0.9)",
            }}
          />
          <span
            className="font-mono text-[11px] uppercase tracking-[0.35em]"
            style={{ color: "hsl(43,90%,68%)" }}
          >
            {copy.eyebrow}
          </span>
        </div>

        {/* Icon */}
        <div
          className="flex items-center justify-center h-14 w-14 rounded-full"
          style={{
            background: "hsla(0,75%,55%,0.12)",
            boxShadow:
              "inset 0 0 0 1px hsla(0,75%,55%,0.45), 0 0 24px hsla(0,75%,55%,0.25)",
          }}
        >
          <AlertTriangle className="h-6 w-6" style={{ color: "hsl(0,75%,68%)" }} />
        </div>

        {/* Title */}
        <h2
          className="font-display text-3xl md:text-4xl font-semibold leading-tight max-w-2xl"
          style={{
            fontFamily: '"Playfair Display", serif',
            color: "hsl(45 35% 92%)",
            textShadow: "0 0 24px hsla(43,90%,68%,0.20)",
          }}
        >
          {copy.title}
        </h2>

        <p
          className="text-sm md:text-[15px] leading-relaxed max-w-xl"
          style={{ color: "hsl(45 12% 70%)" }}
        >
          {copy.subtitle}
        </p>

        {/* Error message block */}
        {error?.message ? (
          <div
            className="w-full max-w-xl rounded-lg px-5 py-4 text-left"
            style={{
              background: "hsla(0,75%,55%,0.08)",
              boxShadow: "inset 0 0 0 1px hsla(0,75%,55%,0.30)",
            }}
          >
            <div
              className="font-mono text-[10px] uppercase tracking-[0.3em] mb-1.5"
              style={{ color: "hsl(0,75%,68%)" }}
            >
              {copy.errorPrefix}
            </div>
            <p
              className="text-sm leading-relaxed break-words"
              style={{ color: "hsl(45 18% 86%)" }}
            >
              {error.message}
            </p>
            {retryable && (
              <p
                className="mt-2 text-[11px]"
                style={{ color: "hsl(43,90%,72%)" }}
              >
                {copy.retryableHint}
              </p>
            )}
          </div>
        ) : null}

        {/* Hints */}
        <div className="w-full max-w-xl text-left">
          <div
            className="font-mono text-[11px] uppercase tracking-[0.3em] mb-2"
            style={{ color: "hsl(43,90%,68%)" }}
          >
            {copy.hintsTitle}
          </div>
          <ul className="space-y-1.5">
            {copy.hints.map((h, i) => (
              <li
                key={i}
                className="flex gap-2.5 text-[13px] leading-relaxed"
                style={{ color: "hsl(45 12% 75%)" }}
              >
                <span
                  className="mt-1.5 inline-block h-1 w-1 rounded-full shrink-0"
                  style={{ background: "hsl(43,90%,68%)" }}
                />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {onRetry && (
            <Button
              onClick={onRetry}
              disabled={isRetrying}
              className="gap-2"
              style={{
                background:
                  "linear-gradient(180deg, hsl(43 90% 70%) 0%, hsl(43 80% 56%) 100%)",
                color: "hsl(20 30% 10%)",
                boxShadow:
                  "inset 0 1px 0 hsla(43,90%,90%,0.6), 0 8px 24px -8px hsla(43,90%,60%,0.55)",
              }}
            >
              <RotateCw className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
              {copy.retry}
            </Button>
          )}
          {onBackToBriefing && (
            <Button
              onClick={onBackToBriefing}
              variant="outline"
              className="gap-2"
              style={{
                background: "hsla(45,12%,12%,0.6)",
                color: "hsl(45 18% 86%)",
                borderColor: "hsla(43,90%,68%,0.25)",
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              {copy.back}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
