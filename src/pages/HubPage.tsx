import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, ArrowRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { hubDefinitions, type HubSubItem } from "@/config/hubConfig";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/* ── Floating particle positions ── */
const particles = [
  { x: "10%", y: "20%", size: 4, delay: 0, dur: 6 },
  { x: "85%", y: "15%", size: 3, delay: 1.2, dur: 7 },
  { x: "70%", y: "75%", size: 5, delay: 0.5, dur: 8 },
  { x: "25%", y: "80%", size: 3, delay: 2, dur: 6.5 },
  { x: "50%", y: "10%", size: 4, delay: 0.8, dur: 7.5 },
  { x: "90%", y: "50%", size: 3, delay: 1.5, dur: 6 },
  { x: "5%", y: "55%", size: 4, delay: 0.3, dur: 8 },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.09, delayChildren: 0.3 },
  },
};

const cardVariant = {
  hidden: { opacity: 0, y: 30, scale: 0.85, filter: "blur(8px)" },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 200, damping: 20 },
  },
};

export default function HubPage() {
  const { hubKey } = useParams<{ hubKey: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [userPlan, setUserPlan] = useState("free");

  useEffect(() => {
    if (user) {
      supabase
        .from("profiles")
        .select("plan, test_mode_plan")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data) setUserPlan(data.test_mode_plan || data.plan);
        });
    }
  }, [user]);

  const hub = hubDefinitions.find((h) => h.key === hubKey);

  if (!hub) {
    return (
      <PageWrapper className="p-8">
        <p className="text-muted-foreground">Hub not found.</p>
      </PageWrapper>
    );
  }

  const isLocked = (item: HubSubItem) => {
    if (!item.plan) return false;
    const hierarchy: Record<string, number> = { free: 0, basic: 1, pro: 2, enterprise: 3 };
    return (hierarchy[userPlan] ?? 0) < (hierarchy[item.plan] ?? 0);
  };

  const HubIcon = hub.icon;

  return (
    <PageWrapper className="relative p-6 md:p-10 max-w-6xl mx-auto overflow-hidden">
      {/* ── Shimmer keyframes ── */}
      <style>{`
        @keyframes shimmer-border {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes pulse-bg {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
        @keyframes glow-ring {
          0%, 100% { box-shadow: 0 0 20px hsla(43,90%,68%,0.3), 0 0 40px hsla(187,84%,55%,0.15); }
          50% { box-shadow: 0 0 30px hsla(43,90%,68%,0.5), 0 0 60px hsla(187,84%,55%,0.25); }
        }
        @keyframes draw-line {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        .hub-card-shimmer {
          position: relative;
        }
        .hub-card-shimmer::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 1rem;
          padding: 1px;
          background: linear-gradient(90deg, transparent 0%, hsla(43,90%,68%,0.4) 25%, hsla(187,84%,55%,0.4) 50%, hsla(43,90%,68%,0.4) 75%, transparent 100%);
          background-size: 200% 100%;
          animation: shimmer-border 3s linear infinite;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
          opacity: 0.5;
          transition: opacity 0.3s;
        }
        .hub-card-shimmer:hover::before {
          opacity: 1;
        }
      `}</style>

      {/* ── Animated gradient background ── */}
      <div className="absolute inset-0 pointer-events-none -z-10">
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 30% 20%, hsla(43,90%,68%,0.06) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, hsla(187,84%,55%,0.05) 0%, transparent 50%)",
            animation: "pulse-bg 6s ease-in-out infinite",
          }}
        />
      </div>

      {/* ── Floating particles ── */}
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none -z-10"
          style={{
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            background: i % 2 === 0
              ? "hsla(43,90%,68%,0.5)"
              : "hsla(187,84%,55%,0.5)",
          }}
          animate={{
            y: [0, -20, 0, 15, 0],
            x: [0, 10, -10, 5, 0],
            opacity: [0.3, 0.7, 0.4, 0.8, 0.3],
          }}
          transition={{
            duration: p.dur,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* ── Hero Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-10"
      >
        <div className="flex items-center gap-5 mb-4">
          {/* Glow-ring icon */}
          <div
            className="p-4 rounded-2xl bg-card border border-border"
            style={{ animation: "glow-ring 3s ease-in-out infinite" }}
          >
            <HubIcon className="h-8 w-8 text-primary" />
          </div>
          <div>
            {/* Gradient text title */}
            <h1
              className="text-3xl md:text-4xl font-bold font-heading tracking-tight"
              style={{
                background: "linear-gradient(135deg, hsl(43 90% 68%), hsl(187 84% 55%))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {t(hub.titleKey)}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm md:text-base">{t(hub.descKey)}</p>
          </div>
        </div>

        {/* Animated divider line */}
        <div className="h-px w-full overflow-hidden">
          <motion.div
            className="h-full"
            style={{
              background: "linear-gradient(90deg, hsla(43,90%,68%,0.6), hsla(187,84%,55%,0.6), transparent)",
              transformOrigin: "left",
            }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          />
        </div>
      </motion.div>

      {/* ── Bento Grid ── */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
      >
        {hub.items.map((item) => {
          const ItemIcon = item.icon;
          const locked = isLocked(item);

          return (
            <motion.div key={item.route} variants={cardVariant}>
              <Link
                to={locked ? "#" : item.route}
                className={`hub-card-shimmer group relative block rounded-2xl p-6 transition-all duration-300
                  ${locked
                    ? "opacity-50 cursor-not-allowed bg-card/40 backdrop-blur-sm"
                    : "bg-card/60 backdrop-blur-md hover:-translate-y-2 hover:shadow-[0_0_40px_hsla(43,90%,68%,0.2),0_0_80px_hsla(187,84%,55%,0.1)]"
                  }`}
                onClick={(e) => locked && e.preventDefault()}
              >
                {/* Hover glow overlay */}
                {!locked && (
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/8 via-transparent to-accent/8 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                )}

                <div className="relative z-10">
                  {/* Icon area with gradient bg */}
                  <div className="flex items-center justify-between mb-5">
                    <div className="relative p-3 rounded-xl bg-muted/30 group-hover:bg-primary/15 transition-all duration-300">
                      <ItemIcon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors duration-300 group-hover:drop-shadow-[0_0_8px_hsla(43,90%,68%,0.6)]" />
                    </div>
                    {locked ? (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <motion.div
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        initial={false}
                      >
                        <ArrowRight className="h-4 w-4 text-primary" />
                      </motion.div>
                    )}
                  </div>

                  <h3 className="font-semibold text-base mb-1.5 group-hover:text-primary transition-colors duration-200">
                    {t(item.titleKey)}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t(item.descKey)}
                  </p>

                  {locked && (
                    <span
                      className="inline-block mt-3 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full"
                      style={{ animation: "pulse-bg 2s ease-in-out infinite" }}
                    >
                      {item.plan === "enterprise" ? "Enterprise" : "Pro"}
                    </span>
                  )}
                </div>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </PageWrapper>
  );
}
