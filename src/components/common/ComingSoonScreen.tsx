import { ReactNode, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Bell, ArrowLeft, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useUserRoles } from '@/hooks/useUserRoles';
import { cn } from '@/lib/utils';

interface FeaturePreview {
  icon: ReactNode;
  title: string;
  description: string;
}

interface ComingSoonScreenProps {
  /** Big page eyebrow / overline */
  eyebrow?: string;
  /** Main headline */
  title: string;
  /** Sub-headline below title */
  subtitle: string;
  /** Optional 3-card feature preview */
  features?: FeaturePreview[];
  /** When true, an admin can click "Preview öffnen (Admin)" to render `adminPreview`. */
  adminPreview?: ReactNode;
  /** Where the back-button leads. Defaults to `/home`. */
  backHref?: string;
  /** Optional extra label that explains why */
  reason?: string;
}

/**
 * Glassy "Coming Soon" gate. Shows a marketing-style page with a
 * "Notify me" CTA. Admins get a button to bypass into the real UI.
 */
export function ComingSoonScreen({
  eyebrow,
  title,
  subtitle,
  features,
  adminPreview,
  backHref = '/home',
  reason,
}: ComingSoonScreenProps) {
  const { isAdmin } = useUserRoles();
  const [previewMode, setPreviewMode] = useState(false);
  const [notified, setNotified] = useState(false);

  if (previewMode && adminPreview) {
    return (
      <div className="relative">
        <div className="sticky top-0 z-50 bg-amber-500/10 backdrop-blur-md border-b border-amber-400/30 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <Eye className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-medium text-amber-400">Admin-Preview</span>
            <span className="text-muted-foreground">— dieses Feature ist für Kunden noch ausgeblendet (Coming Soon)</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPreviewMode(false)}
            className="h-7 text-xs"
          >
            <ArrowLeft className="h-3 w-3 mr-1" /> Zurück zur Coming-Soon-Ansicht
          </Button>
        </div>
        {adminPreview}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 30% 20%, hsla(43,90%,68%,0.08) 0%, transparent 55%), radial-gradient(ellipse at 70% 80%, hsla(187,84%,55%,0.06) 0%, transparent 55%)',
          }}
        />
      </div>

      <div className="max-w-4xl mx-auto px-6 py-16 md:py-24">
        <Link
          to={backHref}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Zurück
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          {eyebrow && (
            <div className="inline-flex items-center gap-2 text-primary text-xs uppercase tracking-[0.25em] mb-4">
              <Sparkles className="h-3 w-3" />
              <span>{eyebrow}</span>
            </div>
          )}

          <Badge
            variant="outline"
            className="mb-6 border-amber-400/40 text-amber-400 bg-amber-400/5 px-3 py-1 text-xs uppercase tracking-widest"
          >
            Coming Soon
          </Badge>

          <h1
            className="font-serif text-4xl md:text-6xl mb-5 leading-tight"
            style={{
              background: 'linear-gradient(135deg, hsl(43 90% 68%), hsl(187 84% 55%))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {title}
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {subtitle}
          </p>

          {reason && (
            <p className="text-xs text-muted-foreground/70 mt-4 max-w-xl mx-auto italic">{reason}</p>
          )}

          {/* Notify CTA */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              size="lg"
              disabled={notified}
              onClick={() => {
                setNotified(true);
                toast.success('Eingetragen', {
                  description: 'Wir melden uns, sobald dieses Feature für dich live geht.',
                });
              }}
              className={cn(
                'gap-2 px-6 h-11 transition-all',
                notified
                  ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_24px_hsla(43,90%,68%,0.35)]',
              )}
            >
              <Bell className="h-4 w-4" />
              {notified ? 'Du wirst benachrichtigt' : 'Benachrichtigt mich beim Launch'}
            </Button>

            {isAdmin && adminPreview && (
              <Button
                size="lg"
                variant="outline"
                onClick={() => setPreviewMode(true)}
                className="gap-2 h-11 border-amber-400/40 text-amber-400 hover:bg-amber-400/10"
              >
                <Eye className="h-4 w-4" /> Preview öffnen (Admin)
              </Button>
            )}
          </div>
        </motion.div>

        {/* Feature preview cards */}
        {features && features.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid md:grid-cols-3 gap-4 mt-16"
          >
            {features.map((f, i) => (
              <Card
                key={i}
                className="p-5 bg-card/40 backdrop-blur-md border-border/60 hover:border-primary/30 transition-colors"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3 text-primary">
                  {f.icon}
                </div>
                <h3 className="font-serif text-lg mb-1.5 leading-tight">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
              </Card>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
