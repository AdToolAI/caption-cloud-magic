import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, BarChart3, Rocket, ArrowRight } from "lucide-react";
import { FeatureGuideDialog } from "@/components/onboarding/FeatureGuideDialog";

const missions = [
  {
    icon: CalendarDays,
    title: "Plane deinen Monat",
    description: "KI-gestützte Content-Planung mit automatischer Zeitoptimierung für maximale Reichweite.",
    step: "01",
    featureId: "planMonth",
  },
  {
    icon: BarChart3,
    title: "Optimiere Performance",
    description: "Echtzeit-Analytics und datenbasierte Insights zur kontinuierlichen Verbesserung.",
    step: "02",
    featureId: "optimizePerformance",
  },
  {
    icon: Rocket,
    title: "Skaliere Kampagnen",
    description: "Automatisiere wiederkehrende Aufgaben und multipliziere deinen Output.",
    step: "03",
    featureId: "scaleCampaigns",
  },
];

export const MissionFeatures = () => {
  const [selectedMission, setSelectedMission] = useState<string | null>(null);

  return (
    <section className="py-24 px-4 relative overflow-hidden">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/30 to-background" />
      
      <div className="container relative z-10 max-w-6xl mx-auto">
        {/* Section Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-2 rounded-full text-sm font-medium mb-4">
            <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
            Mission Control
          </div>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            <span className="text-foreground">Why this tool </span>
            <span className="bg-gradient-to-r from-primary to-gold-dark bg-clip-text text-transparent">
              wins the game
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Drei Schritte zu effektiverem Marketing – systematisch, datengetrieben, skalierbar.
          </p>
        </motion.div>

        {/* Mission Cards - Timeline Style */}
        <div className="relative">
          {/* Connection Line */}
          <div className="hidden md:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent -translate-y-1/2" />
          
          <div className="grid md:grid-cols-3 gap-8">
            {missions.map((mission, index) => (
              <motion.div
                key={mission.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                className="group relative"
              >
                <div className="relative bg-card/60 backdrop-blur-xl border border-border/50 rounded-2xl p-6 h-full hover:border-primary/50 transition-all duration-500 hover:shadow-[var(--shadow-glow-gold)] overflow-hidden">
                  {/* Gold Bottom Line Animation */}
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-gold-dark transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
                  
                  {/* Step Number */}
                  <div className="absolute top-4 right-4 text-5xl font-bold text-border/30 font-display">
                    {mission.step}
                  </div>
                  
                  {/* Icon */}
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                    <mission.icon className="h-7 w-7 text-primary" />
                  </div>
                  
                  {/* Content */}
                  <h3 className="text-xl font-semibold text-foreground mb-3 group-hover:text-primary transition-colors">
                    {mission.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                    {mission.description}
                  </p>
                  
                  {/* Learn More Link - Now clickable */}
                  <button 
                    onClick={() => setSelectedMission(mission.featureId)}
                    className="flex items-center gap-2 text-primary text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:underline"
                  >
                    <span>Mehr erfahren</span>
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Feature Guide Dialog */}
      <FeatureGuideDialog
        featureId={selectedMission}
        open={selectedMission !== null}
        onClose={() => setSelectedMission(null)}
      />
    </section>
  );
};
