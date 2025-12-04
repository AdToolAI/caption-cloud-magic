import { motion } from "framer-motion";
import { Check, Sparkles, Crown, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { translations } from "@/lib/translations";

const plans = [
  {
    name: "Basic",
    price: "14,95",
    period: "/Monat",
    description: "50 Credits",
    icon: Sparkles,
    features: [
      "50 KI-Generierungen pro Monat",
      "3 Social Media Accounts",
      "Basis-Analytics",
      "E-Mail Support",
    ],
    popular: false,
    buttonText: "Starten",
  },
  {
    name: "Pro",
    price: "34,95",
    period: "/Monat",
    description: "150 Credits",
    icon: Crown,
    features: [
      "150 KI-Generierungen pro Monat",
      "10 Social Media Accounts",
      "Erweiterte Analytics",
      "Priority Support",
      "Brand Kit",
      "Content Coach",
    ],
    popular: true,
    badge: "Empfohlen vom MI6",
    buttonText: "Auf Pro upgraden",
  },
  {
    name: "Enterprise",
    price: "69,95",
    period: "/Monat",
    description: "Unlimited",
    icon: Building2,
    features: [
      "Unbegrenzte Generierungen",
      "Unbegrenzte Accounts",
      "White-Label Option",
      "Dedicated Account Manager",
      "Custom Integrationen",
      "SLA garantiert",
    ],
    popular: false,
    buttonText: "Kontakt",
  },
];

export const PricingSection = () => {
  const { language } = useTranslation();

  return (
    <section id="pricing" className="py-24 px-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/30 to-background" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl" />
      
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
            <span className="text-foreground">Wähle deinen </span>
            <span className="bg-gradient-to-r from-primary to-gold-dark bg-clip-text text-transparent">
              Einsatz-Level
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Flexible Pläne für Einzelkämpfer bis zu ganzen Marketing-Teams.
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative group ${plan.popular ? 'md:-mt-4 md:mb-4' : ''}`}
            >
              {/* Popular Badge */}
              {plan.popular && plan.badge && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                  <div className="bg-gradient-to-r from-primary to-gold-dark text-primary-foreground text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
                    {plan.badge}
                  </div>
                </div>
              )}
              
              <div className={`relative h-full bg-card/60 backdrop-blur-xl border rounded-2xl p-6 transition-all duration-500 ${
                plan.popular 
                  ? 'border-primary/50 shadow-[var(--shadow-glow-gold)]' 
                  : 'border-border/50 hover:border-accent/30'
              } hover:shadow-xl hover:-translate-y-1`}>
                
                {/* Plan Header */}
                <div className="text-center mb-6">
                  <div className={`w-14 h-14 rounded-2xl ${plan.popular ? 'bg-gradient-to-br from-primary/30 to-gold-dark/20' : 'bg-muted/50'} flex items-center justify-center mx-auto mb-4`}>
                    <plan.icon className={`h-7 w-7 ${plan.popular ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">{plan.name}</h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold text-foreground">€{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className={`h-5 w-5 mt-0.5 flex-shrink-0 ${plan.popular ? 'text-primary' : 'text-accent'}`} />
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <Button 
                  asChild 
                  className={`w-full h-11 font-semibold transition-all duration-300 ${
                    plan.popular 
                      ? 'bg-gradient-to-r from-primary to-gold-dark text-primary-foreground hover:shadow-[var(--shadow-glow-gold)] hover:scale-[1.02]' 
                      : 'bg-muted/50 text-foreground hover:bg-muted border border-border/50'
                  }`}
                >
                  <Link to="/pricing">{plan.buttonText}</Link>
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
