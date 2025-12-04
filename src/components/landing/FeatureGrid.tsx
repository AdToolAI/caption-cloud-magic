import { motion } from "framer-motion";
import { 
  Calendar, TrendingUp, Palette, MessageSquare, Share2, Target,
  Sparkles, Zap, BarChart3, Users, Clock, Shield
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

const features = [
  {
    icon: Calendar,
    title: "Content Planung",
    description: "Plane und automatisiere deine Posts für alle Plattformen",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    icon: TrendingUp,
    title: "Analytics Dashboard",
    description: "Echtzeit-Insights zu Performance und Engagement",
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
  {
    icon: Palette,
    title: "Brand Kit",
    description: "Konsistente Markenidentität über alle Kanäle",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    icon: MessageSquare,
    title: "KI Content Coach",
    description: "Personalisierte Tipps zur Content-Optimierung",
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
  {
    icon: Share2,
    title: "Multi-Platform",
    description: "Instagram, TikTok, LinkedIn, X und mehr",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    icon: Target,
    title: "Zielverfolgung",
    description: "Setze und erreiche deine Marketing-Ziele",
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
];

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

  return (
    <section className="py-24 px-4 relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-card/50 to-background" />
      
      <div className="container relative z-10 max-w-6xl mx-auto">
        {/* Section Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            <span className="text-foreground">Alles was du brauchst für </span>
            <span className="bg-gradient-to-r from-accent to-cyan-glow bg-clip-text text-transparent">
              Social Media Erfolg
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Ein komplettes Arsenal an Tools für professionelles Social Media Marketing.
          </p>
        </motion.div>

        {/* Feature Grid */}
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
              <div className="relative h-full bg-card/60 backdrop-blur-xl border border-border/50 rounded-2xl p-6 hover:border-accent/50 transition-all duration-300 hover:shadow-[var(--shadow-glow-cyan)] hover:-translate-y-1">
                {/* Icon */}
                <div className={`w-12 h-12 rounded-xl ${feature.bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <feature.icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                
                {/* Content */}
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};
