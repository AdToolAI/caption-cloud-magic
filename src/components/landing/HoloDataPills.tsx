import { TrendingUp, Clock, Eye } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface PillProps {
  icon: typeof TrendingUp;
  value: string;
  label: string;
  accent?: "gold" | "red";
  delay?: string;
}

const Pill = ({ icon: Icon, value, label, accent = "gold", delay = "0s" }: PillProps) => {
  const isRed = accent === "red";
  return (
    <div
      className="relative inline-flex items-center gap-2 px-3 py-2 bg-black/85 backdrop-blur-md whitespace-nowrap"
      style={{
        borderRadius: "3px",
        boxShadow: isRed
          ? `0 0 0 1px hsla(355, 75%, 48%, 0.8), inset 0 0 0 1px rgba(0,0,0,0.85), 0 8px 24px -6px rgba(0,0,0,0.85), 0 0 24px -6px hsla(355, 75%, 48%, 0.5)`
          : `0 0 0 1px hsla(43, 90%, 68%, 0.65), inset 0 0 0 1px rgba(0,0,0,0.85), 0 8px 24px -6px rgba(0,0,0,0.85), 0 0 18px -6px hsla(43, 90%, 68%, 0.4)`,
        animation: `holo-float 4.5s ease-in-out infinite`,
        animationDelay: delay,
      }}
    >
      <Icon
        className="h-3.5 w-3.5"
        style={{ color: isRed ? "hsl(355, 75%, 58%)" : "hsl(var(--primary))" }}
      />
      <div className="flex flex-col leading-none">
        <span
          className="text-[12px] font-mono font-bold tabular-nums tracking-wide"
          style={{ color: isRed ? "hsl(355, 75%, 65%)" : "hsl(var(--primary))" }}
        >
          {value}
        </span>
        <span className="text-[8px] uppercase tracking-[0.2em] text-muted-foreground/80 mt-0.5 font-semibold">
          {label}
        </span>
      </div>

      {/* Top hairline */}
      <div
        className="absolute inset-x-2 top-0 h-px"
        style={{
          background: isRed
            ? "linear-gradient(90deg, transparent, hsla(355, 75%, 58%, 0.7), transparent)"
            : "linear-gradient(90deg, transparent, hsla(43, 90%, 68%, 0.7), transparent)",
        }}
      />
    </div>
  );
};

export const HoloDataPills = () => {
  const { t } = useTranslation();
  return (
    <>
      <style>{`
        @keyframes holo-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
      <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
        <Pill
          icon={TrendingUp}
          value="+43%"
          label={t("landing.hero.deck.pillEngagement")}
          delay="0s"
        />
        <Pill
          icon={Clock}
          value="19:00"
          label={t("landing.hero.deck.pillBestTime")}
          delay="0.8s"
        />
        <Pill
          icon={Eye}
          value="2.4M"
          label={t("landing.hero.deck.pillReach")}
          accent="red"
          delay="1.6s"
        />
      </div>
    </>
  );
};
