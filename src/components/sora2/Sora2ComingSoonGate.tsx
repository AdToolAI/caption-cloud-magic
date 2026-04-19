import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Film, ArrowRight, BellRing, Loader2, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSora2Access } from '@/hooks/useSora2Access';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/hooks/useTranslation';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { trackEvent } from '@/lib/analytics';

interface Sora2ComingSoonGateProps {
  children: ReactNode;
}

/**
 * Wraps any Sora 2 surface. Existing/grandfathered users see the children
 * unchanged. New users see a polished "Coming Soon" page with a Kling 3 CTA
 * and an opt-in waitlist.
 */
export const Sora2ComingSoonGate = ({ children }: Sora2ComingSoonGateProps) => {
  const { hasAccess, isLoading } = useSora2Access();
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  const handleJoinWaitlist = async () => {
    if (!user?.email) {
      toast.error(t('sora2Gate.waitlistNoEmail'));
      return;
    }
    setJoining(true);
    try {
      const { error } = await supabase.from('sora2_waitlist').insert({
        user_id: user.id,
        email: user.email,
        language,
      });
      if (error && error.code !== '23505') throw error;
      setJoined(true);
      trackEvent('sora2_waitlist_joined', { language });
      toast.success(t('sora2Gate.waitlistJoined'));
    } catch (err) {
      console.error('Waitlist error:', err);
      toast.error(t('sora2Gate.waitlistError'));
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 30% 20%, hsla(43,90%,68%,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, hsla(187,84%,55%,0.06) 0%, transparent 50%)',
          }}
        />
      </div>

      <div className="container mx-auto px-4 py-16 md:py-24 max-w-4xl relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <Badge
            variant="secondary"
            className="mb-6 text-xs uppercase tracking-widest px-3 py-1"
          >
            {t('sora2Gate.badge')}
          </Badge>
          <div className="flex justify-center mb-6">
            <div
              className="p-5 rounded-2xl bg-card border border-border"
              style={{ boxShadow: '0 0 40px hsla(43,90%,68%,0.25)' }}
            >
              <Film className="h-12 w-12 text-primary" />
            </div>
          </div>
          <h1
            className="text-4xl md:text-5xl font-bold font-heading tracking-tight mb-4"
            style={{
              background: 'linear-gradient(135deg, hsl(43 90% 68%), hsl(187 84% 55%))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {t('sora2Gate.title')}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t('sora2Gate.subtitle')}
          </p>
        </motion.div>

        {/* Kling recommendation card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <Card className="p-8 md:p-10 mb-6 bg-card/80 backdrop-blur border-primary/30 relative overflow-hidden">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse at top right, hsla(187,84%,55%,0.12) 0%, transparent 60%)',
              }}
            />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {t('sora2Gate.recommendedAlternative')}
                </span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold mb-3">
                {t('sora2Gate.klingTitle')}
              </h2>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                {t('sora2Gate.klingDescription')}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {(['feat1', 'feat2', 'feat3', 'feat4'] as const).map((k) => (
                  <div key={k} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-xs text-muted-foreground">
                      {t(`sora2Gate.${k}`)}
                    </span>
                  </div>
                ))}
              </div>
              <Button
                asChild
                size="lg"
                className="w-full md:w-auto"
                onClick={() => trackEvent('kling_redirect_clicked', { from: 'sora2_gate' })}
              >
                <Link to="/kling-video-studio">
                  {t('sora2Gate.tryKling')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Card>
        </motion.div>

        {/* Waitlist card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <Card className="p-6 bg-card/40 backdrop-blur border-border/50">
            <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
              <div className="flex items-start gap-3">
                <BellRing className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold mb-1">{t('sora2Gate.waitlistTitle')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('sora2Gate.waitlistDescription')}
                  </p>
                </div>
              </div>
              <Button
                variant={joined ? 'secondary' : 'outline'}
                onClick={handleJoinWaitlist}
                disabled={joining || joined}
                className="flex-shrink-0"
              >
                {joining ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : joined ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    {t('sora2Gate.waitlistJoinedShort')}
                  </>
                ) : (
                  t('sora2Gate.waitlistButton')
                )}
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};
