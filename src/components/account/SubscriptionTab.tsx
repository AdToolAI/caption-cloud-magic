import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { getProductInfo, pricingPlans } from "@/config/pricing";
import { Crown, Calendar, CreditCard, Zap, ArrowRight, Sparkles } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { getCurrencyForLanguage } from "@/lib/currency";

export const SubscriptionTab = () => {
  const navigate = useNavigate();
  const { subscribed, productId, subscriptionEnd } = useAuth();
  const { t, language } = useTranslation();
  const planInfo = getProductInfo(productId);
  const symbol = getCurrencyForLanguage(language) === 'USD' ? '$' : '€';
  const perMonth = language === 'de' ? 'pro Monat' : language === 'es' ? 'al mes' : 'per month';
  
  // Check if user has any paid plan (Basic, Pro, or Enterprise)
  const hasPaidPlan = subscribed && productId;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Current Plan */}
      <Card className="backdrop-blur-xl bg-card/60 border border-white/10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-cyan-500/5" />
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2">
            {hasPaidPlan ? (
              <Crown className="h-5 w-5 text-primary" />
            ) : (
              <Zap className="h-5 w-5 text-muted-foreground" />
            )}
            {language === 'de' ? 'Aktueller Plan' : language === 'es' ? 'Plan Actual' : 'Current Plan'}
          </CardTitle>
          <CardDescription>
            {language === 'de' ? 'Ihr aktuelles Abonnement und Abrechnungsdetails' : language === 'es' ? 'Tu suscripción actual y detalles de facturación' : 'Your current subscription and billing details'}
          </CardDescription>
        </CardHeader>
        <CardContent className="relative space-y-6">
          {/* Plan Info */}
          <div className="flex items-center justify-between p-5 rounded-xl bg-muted/20 border border-white/5">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                hasPaidPlan 
                  ? "bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20" 
                  : "bg-muted/30 border border-white/10"
              }`}>
                {hasPaidPlan ? (
                  <Crown className="h-7 w-7 text-primary" />
                ) : (
                  <Zap className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <div>
                <h3 className="text-xl font-semibold flex items-center gap-2">
                  {planInfo.name}
                  {hasPaidPlan && (
                     <Badge className="bg-primary/10 text-primary border-primary/20">
                       {language === 'de' ? 'Aktiv' : language === 'es' ? 'Activo' : 'Active'}
                     </Badge>
                  )}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {subscribed 
                    ? (language === 'de' ? 'Zugriff auf alle Premium-Funktionen' : language === 'es' ? 'Acceso a todas las funciones premium' : 'Access to all premium features')
                    : (language === 'de' ? 'Begrenzter Zugriff auf Basis-Funktionen' : language === 'es' ? 'Acceso limitado a funciones básicas' : 'Limited access to basic features')}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">
                {symbol}{planInfo.price}
              </p>
              <p className="text-sm text-muted-foreground">{perMonth}</p>
            </div>
          </div>

          {/* Billing Date */}
          {subscribed && subscriptionEnd && (
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/10 border border-white/5">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-cyan-400" />
                <div>
                  <p className="font-medium">{language === 'de' ? 'Nächster Abrechnungstermin' : language === 'es' ? 'Próxima fecha de facturación' : 'Next billing date'}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(subscriptionEnd).toLocaleDateString(language === 'de' ? 'de-DE' : language === 'es' ? 'es-ES' : 'en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            {subscribed ? (
              <>
                <Button 
                  variant="outline" 
                  className="flex-1 h-12 border-white/10 hover:bg-white/5"
                  onClick={() => navigate('/billing')}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  {language === 'de' ? 'Abonnement verwalten' : language === 'es' ? 'Gestionar suscripción' : 'Manage subscription'}
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1 h-12 border-white/10 hover:bg-white/5"
                  onClick={() => navigate('/credits')}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {language === 'de' ? 'Credits kaufen' : language === 'es' ? 'Comprar créditos' : 'Buy credits'}
                </Button>
              </>
            ) : (
              <Button 
                className="flex-1 h-12 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                onClick={() => navigate('/pricing')}
              >
                <Crown className="h-4 w-4 mr-2" />
                {language === 'de' ? 'Auf Pro upgraden' : language === 'es' ? 'Actualizar a Pro' : 'Upgrade to Pro'}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Credits Shortcut */}
      <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Credits
          </CardTitle>
          <CardDescription>
            {language === 'de' ? 'Verwalten Sie Ihre Credits für KI-Generierungen' : language === 'es' ? 'Gestione sus créditos para generaciones de IA' : 'Manage your credits for AI generations'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            variant="outline" 
            className="h-12 border-white/10 hover:bg-white/5"
            onClick={() => navigate('/credits')}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {language === 'de' ? 'Credit-Übersicht öffnen' : language === 'es' ? 'Abrir resumen de créditos' : 'Open credit overview'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
};
