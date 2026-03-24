import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { hubDefinitions, type HubSubItem } from "@/config/hubConfig";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.15 },
  },
};

const cardVariant = {
  hidden: { opacity: 0, y: 24, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 260, damping: 22 } },
};

export default function HubPage() {
  const { hubKey } = useParams<{ hubKey: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
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
    <PageWrapper className="p-6 md:p-10 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-10"
      >
        <div className="flex items-center gap-4 mb-3">
          <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
            <HubIcon className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold font-heading tracking-tight">{t(hub.titleKey)}</h1>
            <p className="text-muted-foreground mt-1">{t(hub.descKey)}</p>
          </div>
        </div>
      </motion.div>

      {/* Bento Grid */}
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
                className={`group relative block rounded-2xl border p-6 transition-all duration-300
                  ${locked
                    ? "opacity-60 cursor-not-allowed border-border bg-card"
                    : "border-border/50 bg-card/80 backdrop-blur-sm hover:border-primary/40 hover:shadow-[0_0_30px_rgba(124,58,237,0.12)] hover:-translate-y-1"
                  }`}
                onClick={(e) => locked && e.preventDefault()}
              >
                {/* Glow effect on hover */}
                {!locked && (
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                )}

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2.5 rounded-xl bg-muted/50 group-hover:bg-primary/10 transition-colors duration-300">
                      <ItemIcon className="h-5 w-5 text-foreground group-hover:text-primary transition-colors duration-300" />
                    </div>
                    {locked && <Lock className="h-4 w-4 text-muted-foreground" />}
                  </div>

                  <h3 className="font-semibold text-base mb-1.5 group-hover:text-primary transition-colors duration-200">
                    {t(item.titleKey)}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t(item.descKey)}
                  </p>

                  {locked && (
                    <span className="inline-block mt-3 text-xs font-medium text-primary/80 bg-primary/10 px-2.5 py-1 rounded-full">
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
