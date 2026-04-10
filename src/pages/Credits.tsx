import { motion } from "framer-motion";
import { CreditBalance } from "@/components/credits/CreditBalance";
import { CreditHistory } from "@/components/credits/CreditHistory";
import { CreditsHeroHeader } from "@/components/credits/CreditsHeroHeader";
import { useCredits } from "@/hooks/useCredits";
import { Sparkles, Zap, Crown } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { getCurrencyForLanguage } from "@/lib/currency";

const Credits = () => {
  const { balance } = useCredits();
  const { language } = useTranslation();
  const symbol = getCurrencyForLanguage(language) === 'USD' ? '$' : '€';

  const handleBuyCredits = () => {
    // TODO: Integrate with Stripe checkout
    console.log('Opening credit purchase dialog');
  };

  const getPlanName = () => {
    if (!balance) return language === 'de' ? 'Laden...' : language === 'es' ? 'Cargando...' : 'Loading...';
    const planNames: Record<string, Record<string, string>> = {
      free: { en: 'Free Plan', de: 'Kostenloser Plan', es: 'Plan Gratis' },
      basic: { en: 'Basic Plan', de: 'Basic Plan', es: 'Plan Básico' },
      pro: { en: 'Pro Plan', de: 'Pro Plan', es: 'Plan Pro' },
      enterprise: { en: 'Enterprise Plan', de: 'Enterprise Plan', es: 'Plan Empresarial' },
    };
    return planNames[balance.plan_code]?.[language] || 'Plan';
  };

  const packages = [
    { 
      credits: 1000, 
      name: language === 'de' ? 'Extra Paket' : language === 'es' ? 'Paquete Extra' : 'Extra Pack', 
      price: `${symbol}${getCurrencyForLanguage(language) === 'USD' ? '14.95' : '14,95'}`,
      icon: Zap,
      popular: false,
      description: language === 'de' ? 'Perfekt für gelegentliche Nutzung' : language === 'es' ? 'Perfecto para uso ocasional' : 'Perfect for occasional use'
    },
    { 
      credits: 2500, 
      name: language === 'de' ? 'Business Paket' : language === 'es' ? 'Paquete Business' : 'Business Pack', 
      price: `${symbol}${getCurrencyForLanguage(language) === 'USD' ? '29.95' : '29,95'}`,
      icon: Sparkles,
      popular: true,
      description: language === 'de' ? 'Beliebteste Wahl für Profis' : language === 'es' ? 'La opción más popular para profesionales' : 'Most popular choice for pros'
    },
    { 
      credits: 5000, 
      name: language === 'de' ? 'Enterprise Paket' : language === 'es' ? 'Paquete Enterprise' : 'Enterprise Pack', 
      price: `${symbol}${getCurrencyForLanguage(language) === 'USD' ? '44.95' : '44,95'}`,
      icon: Crown,
      popular: false,
      description: language === 'de' ? 'Maximale Power für Teams' : language === 'es' ? 'Máximo poder para equipos' : 'Maximum power for teams'
    },
  ];

  return (
    <div className="container mx-auto p-6 space-y-8">
      <CreditsHeroHeader 
        planName={getPlanName()}
        creditsAvailable={balance?.balance || 0}
        onBuyCredits={handleBuyCredits}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <CreditBalance />
        
        {/* Premium Credit Packages Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6 hover:shadow-[0_0_30px_hsla(43,90%,68%,0.1)] transition-all duration-300"
        >
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">{language === 'de' ? 'Credit-Pakete' : language === 'es' ? 'Paquetes de créditos' : 'Credit Packages'}</h2>
          </div>
          <p className="text-muted-foreground text-sm mb-6">{language === 'de' ? 'Kaufen Sie zusätzliche Credits' : language === 'es' ? 'Compre créditos adicionales' : 'Buy additional credits'}</p>
          
          <div className="space-y-4">
            {packages.map((pkg, index) => {
              const Icon = pkg.icon;
              return (
                <motion.div
                  key={pkg.credits}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 + index * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  className={`
                    relative p-4 rounded-xl cursor-pointer transition-all duration-300 group
                    ${pkg.popular 
                      ? 'bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-2 border-primary/30 hover:border-primary/50 hover:shadow-[0_0_25px_hsla(43,90%,68%,0.2)]' 
                      : 'bg-card/40 border border-white/10 hover:border-primary/30 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.1)]'
                    }
                  `}
                >
                  {/* Popular Badge */}
                  {pkg.popular && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute -top-3 left-4 px-3 py-1 rounded-full bg-gradient-to-r from-primary to-amber-500 text-xs font-semibold text-primary-foreground"
                    >
                    <motion.span
                        animate={{ opacity: [1, 0.7, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        ⭐ {language === 'de' ? 'Beliebteste Wahl' : language === 'es' ? 'Más popular' : 'Most Popular'}
                      </motion.span>
                    </motion.div>
                  )}

                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className={`
                        p-2 rounded-lg 
                        ${pkg.popular 
                          ? 'bg-primary/20 text-primary' 
                          : 'bg-muted/30 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                        }
                        transition-colors duration-300
                      `}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold">{pkg.credits.toLocaleString()} Credits</p>
                        <p className="text-sm text-muted-foreground">{pkg.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`
                        text-2xl font-bold 
                        ${pkg.popular 
                          ? 'bg-gradient-to-r from-primary to-amber-400 bg-clip-text text-transparent' 
                          : 'text-foreground'
                        }
                      `}>
                        {pkg.price}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>

      <CreditHistory />
    </div>
  );
};

export default Credits;
