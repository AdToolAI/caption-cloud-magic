/**
 * FounderCrest — small "Founders Circle" mark for the app header.
 * Renders nothing for non-founders. Shows no slot number or position.
 */
import { Crown } from "lucide-react";
import { useFounderStatus } from "@/hooks/useFounderStatus";
import { useTranslation } from "@/hooks/useTranslation";

const label = {
  de: "Founders Circle",
  en: "Founders Circle",
  es: "Founders Circle",
} as const;

interface Props {
  className?: string;
  compact?: boolean;
}

export function FounderCrest({ className = "", compact = false }: Props) {
  const { isActive, loading } = useFounderStatus();
  const { language } = useTranslation();

  if (loading || !isActive) return null;

  const text = label[(language as keyof typeof label)] ?? label.en;

  return (
    <span
      title={text}
      aria-label={text}
      className={`inline-flex items-center gap-1.5 rounded-full border border-primary/45 bg-gradient-to-r from-primary/15 via-primary/5 to-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary shadow-[0_0_18px_-6px_hsl(var(--primary)/0.7)] ${className}`}
    >
      <Crown className="h-3 w-3" />
      {!compact && <span className="hidden sm:inline">{text}</span>}
    </span>
  );
}

export default FounderCrest;
