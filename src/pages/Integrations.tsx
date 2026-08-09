import { ConnectionsTab } from "@/components/performance/ConnectionsTab";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/card";
import { SEO } from "@/components/SEO";
import { Link2, Shield, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { tx } from "@/lib/i18nText";

export default function Integrations() {
  const { user } = useAuth();
  const { t, setLanguage } = useTranslation();
  const [userPlan, setUserPlan] = useState<string>("free");
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Force a specific UI language when ?lang= is present (used by Meta App Reviewers with ?lang=en)
  useEffect(() => {
    const langParam = searchParams.get('lang');
    if (langParam === 'en' || langParam === 'de' || langParam === 'es') {
      setLanguage(langParam as any);
    }
  }, [searchParams, setLanguage]);

  useEffect(() => {
    if (user) {
      loadUserPlan();
    }
  }, [user]);

  // Handle OAuth callback errors/success from URL params
  useEffect(() => {
    const error = searchParams.get('error');
    const connected = searchParams.get('connected');
    const status = searchParams.get('status');

    if (error === 'tiktok_oauth_failed') {
      toast({
        title: tx({ de: 'TikTok-Verbindung fehlgeschlagen', en: 'TikTok connection failed', es: 'Fallo en la conexión con TikTok' }),
        description:
          tx({ de: 'Die Verbindung mit TikTok konnte nicht hergestellt werden. Bitte versuche es erneut. Falls das Problem bestehen bleibt, kontaktiere den Support.', en: 'The connection with TikTok could not be established. Please try again. If the problem persists, contact support.', es: 'No se pudo establecer la conexión con TikTok. Inténtalo de nuevo. Si el problema persiste, contacta con soporte.' }),
        variant: 'destructive',
      });
    } else if (error === 'tiktok_oauth_denied') {
      toast({
        title: tx({ de: 'TikTok-Autorisierung abgebrochen', en: 'TikTok authorization canceled', es: 'Autorización de TikTok cancelada' }),
        description:
          tx({ de: 'Du hast die Autorisierung in TikTok abgelehnt. Klicke erneut auf „Verbinden", um es noch einmal zu versuchen.', en: 'You declined the authorization in TikTok. Click "Connect" again to try once more.', es: 'Rechazaste la autorización en TikTok. Haz clic en "Conectar" de nuevo para intentarlo otra vez.' }),
        variant: 'destructive',
      });
    } else if (connected === 'tiktok' && status === 'success') {
      toast({
        title: tx({ de: 'TikTok erfolgreich verbunden', en: 'TikTok connected successfully', es: 'TikTok conectado correctamente' }),
        description: tx({ de: 'Dein TikTok-Account ist jetzt verknüpft.', en: 'Your TikTok account is now linked.', es: 'Tu cuenta de TikTok ya está vinculada.' }),
      });
    }

    // Clean URL params after handling
    if (error || connected) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('error');
      newParams.delete('connected');
      newParams.delete('status');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const loadUserPlan = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("plan, test_mode_plan")
      .eq("id", user.id)
      .single();
    
    if (data) {
      setUserPlan(data.test_mode_plan || data.plan);
    }
  };

  return (
    <PageWrapper>
      <SEO
        title={t('socialIntegrations.title')}
        description={t('socialIntegrations.seoDescription')}
      />
      
      <div className="space-y-6 max-w-7xl mx-auto p-6">
        {/* Hero Section */}
        <Card className="p-8 bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5 border-primary/10">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Link2 className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">{t('socialIntegrations.title')}</h1>
              <p className="text-muted-foreground text-lg mb-4">
                {t('socialIntegrations.subtitle')}
              </p>
              <div className="flex flex-wrap gap-3">
                <Badge variant="outline" className="gap-2">
                  <Shield className="h-3 w-3" />
                  {t('socialIntegrations.secureOAuth')}
                </Badge>
                <Badge variant="outline" className="gap-2">
                  <Zap className="h-3 w-3" />
                  {t('socialIntegrations.autoSync')}
                </Badge>
              </div>
            </div>
          </div>
        </Card>

        {/* Connections Tab */}
        <ConnectionsTab />
      </div>
    </PageWrapper>
  );
}
