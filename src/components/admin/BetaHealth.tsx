import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Sparkles, ShieldAlert, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const FOUNDERS_MAX_SLOTS = 1000;

interface BetaMetrics {
  foundersClaimed: number;
  totalUsers: number;
  last24hSignups: number;
  loading: boolean;
  error: string | null;
}

/**
 * Admin Dashboard tile: "Beta Health" — quick pulse on launch KPIs.
 *
 * Metrics:
 * - Founders slots claimed / remaining
 * - Total users
 * - Signups in the last 24h
 *
 * Auth / feature-gate / credit-refund events are tracked in PostHog via
 * `ANALYTICS_EVENTS.AUTH_ERROR_SHOWN`, `FEATURE_GATE_HIT`,
 * `CREDIT_REFUND_TRIGGERED`. Detailed funnels live there.
 */
export function BetaHealth() {
  const [m, setM] = useState<BetaMetrics>({
    foundersClaimed: 0,
    totalUsers: 0,
    last24hSignups: 0,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const [founders, profilesTotal, profilesRecent] = await Promise.all([
          supabase.from("founders_signups").select("id", { count: "exact", head: true }),
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .gte("created_at", since),
        ]);

        if (cancelled) return;

        setM({
          foundersClaimed: founders.count ?? 0,
          totalUsers: profilesTotal.count ?? 0,
          last24hSignups: profilesRecent.count ?? 0,
          loading: false,
          error: founders.error?.message || profilesTotal.error?.message || null,
        });
      } catch (err) {
        if (!cancelled) {
          setM((prev) => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err.message : "unknown error",
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (m.loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const remaining = Math.max(0, FOUNDERS_MAX_SLOTS - m.foundersClaimed);
  const pct = Math.min(100, (m.foundersClaimed / FOUNDERS_MAX_SLOTS) * 100);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Beta Health</h2>
        <p className="text-sm text-muted-foreground">
          Launch-KPIs auf einen Blick. Detaillierte Funnels in PostHog unter
          <code className="mx-1 rounded bg-muted px-1 text-xs">beta_signup</code>,
          <code className="mx-1 rounded bg-muted px-1 text-xs">founders_slot_claimed</code>,
          <code className="mx-1 rounded bg-muted px-1 text-xs">feature_gate_hit</code>,
          <code className="mx-1 rounded bg-muted px-1 text-xs">credit_refund_triggered</code>,
          <code className="mx-1 rounded bg-muted px-1 text-xs">auth_error_shown</code>.
        </p>
      </div>

      {m.error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 flex items-center gap-3 text-sm text-destructive">
            <ShieldAlert className="h-4 w-4" />
            Fehler beim Laden: {m.error}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Founders-Slots
              </CardTitle>
              <Sparkles className="h-4 w-4 text-amber-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {m.foundersClaimed}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / {FOUNDERS_MAX_SLOTS}
              </span>
            </div>
            <Progress value={pct} className="mt-3 h-2" />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{remaining} frei</span>
              {remaining === 0 && (
                <Badge variant="destructive" className="gap-1">
                  <Ban className="h-3 w-3" />
                  Ausverkauft
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Users
              </CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{m.totalUsers}</div>
            <CardDescription className="mt-2 text-xs">
              Alle registrierten Profile
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Signups · 24h
              </CardTitle>
              <Users className="h-4 w-4 text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{m.last24hSignups}</div>
            <CardDescription className="mt-2 text-xs">
              Neue Konten in den letzten 24 Stunden
            </CardDescription>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default BetaHealth;
