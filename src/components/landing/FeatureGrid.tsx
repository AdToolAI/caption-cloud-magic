import { motion } from "framer-motion";
import { 
  Calendar, TrendingUp, Palette, MessageSquare, Share2, Target,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export const FeatureGrid = () => {
  const { t } = useTranslation();

  const features = [
    {
      icon: Calendar,
      title: t("landing.featureGrid.contentPlanning"),
      description: t("landing.featureGrid.contentPlanningDesc"),
      color: "text-primary",
      bgColor: "bg-primary/10",
      link: "/calendar",
    },
    {
      icon: TrendingUp,
      title: t("landing.featureGrid.analyticsDashboard"),
      description: t("landing.featureGrid.analyticsDashboardDesc"),
      color: "text-accent",
      bgColor: "bg-accent/10",
      link: "/analytics",
    },
    {
      icon: Palette,
      title: t("landing.featureGrid.brandKit"),
      description: t("landing.featureGrid.brandKitDesc"),
      color: "text-primary",
      bgColor: "bg-primary/10",
      link: "/brand-kit",
    },
    {
      icon: MessageSquare,
      title: t("landing.featureGrid.aiContentCoach"),
      description: t("landing.featureGrid.aiContentCoachDesc"),
      color: "text-accent",
      bgColor: "bg-accent/10",
      link: "/coach",
    },
    {
      icon: Share2,
      title: t("landing.featureGrid.multiPlatform"),
      description: t("landing.featureGrid.multiPlatformDesc"),
      color: "text-primary",
      bgColor: "bg-primary/10",
      link: "/composer",
    },
    {
      icon: Target,
      title: t("landing.featureGrid.goalTracking"),
      description: t("landing.featureGrid.goalTrackingDesc"),
      color: "text-accent",
      bgColor: "bg-accent/10",
      link: "/goals",
    },
  ];

  return (
    <section className="py-24 px-4 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-card/50 to-background" />
      
      <div className="container relative z-10 max-w-6xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            <span className="text-foreground">{t("landing.featureGrid.title1")}</span>
            <span className="bg-gradient-to-r from-accent to-cyan-glow bg-clip-text text-transparent">
              {t("landing.featureGrid.title2")}
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            {t("landing.featureGrid.subtitle")}
          </p>
        </motion.div>

        <motion.div 
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={item}
              className="group"
            >
              <Link to={feature.link}>
                <div className="relative h-full bg-card/60 backdrop-blur-xl border border-border/50 rounded-2xl p-6 hover:border-accent/50 transition-all duration-300 hover:shadow-[var(--shadow-glow-cyan)] hover:-translate-y-1 cursor-pointer">
                  <div className={`w-12 h-12 rounded-xl ${feature.bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon className={`h-6 w-6 ${feature.color}`} />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};
