import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Save, RotateCcw, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FEATURE_FLAGS } from '@/config/pricing';

interface FeatureFlagConfig {
  key: string;
  label: string;
  description: string;
  defaultValue: boolean;
}

const FEATURE_FLAG_CONFIGS: FeatureFlagConfig[] = [
  {
    key: 'ff_reco_card',
    label: 'Recommendation Card',
    description: 'AI-powered content recommendations on dashboard',
    defaultValue: FEATURE_FLAGS.ff_reco_card,
  },
  {
    key: 'ff_pricing_v21',
    label: 'Pricing V2.1',
    description: 'Updated pricing structure with USD support',
    defaultValue: FEATURE_FLAGS.ff_pricing_v21,
  },
  {
    key: 'ff_pricing_sst',
    label: 'Pricing SST',
    description: 'Self-service tiers for pricing',
    defaultValue: FEATURE_FLAGS.ff_pricing_sst,
  },
  {
    key: 'ff_onboarding_v1',
    label: 'Onboarding V1',
    description: 'Interactive onboarding flow for new users',
    defaultValue: FEATURE_FLAGS.ff_onboarding_v1,
  },
  {
    key: 'ff_quickpost_gate',
    label: 'Quick Post Gate',
    description: 'Plan-based gating for quick calendar posts',
    defaultValue: FEATURE_FLAGS.ff_quickpost_gate,
  },
  {
    key: 'ff_empty_states_v2',
    label: 'Empty States V2',
    description: 'Improved empty state designs',
    defaultValue: FEATURE_FLAGS.ff_empty_states_v2,
  },
  {
    key: 'ff_affiliates',
    label: 'Affiliates Program',
    description: 'Affiliate tracking and commission system',
    defaultValue: FEATURE_FLAGS.ff_affiliates,
  },
];

export default function FeatureFlags() {
  const { toast } = useToast();
  const [flags, setFlags] = useState<Record<string, boolean>>(() => {
    const stored = localStorage.getItem('feature_flags_override');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        return {};
      }
    }
    return {};
  });

  const [hasChanges, setHasChanges] = useState(false);

  const isActive = (key: string): boolean => {
    if (flags[key] !== undefined) {
      return flags[key];
    }
    const config = FEATURE_FLAG_CONFIGS.find((f) => f.key === key);
    return config?.defaultValue ?? false;
  };

  const toggleFlag = (key: string) => {
    setFlags((prev) => ({
      ...prev,
      [key]: !isActive(key),
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    localStorage.setItem('feature_flags_override', JSON.stringify(flags));
    toast({
      title: 'Feature Flags gespeichert',
      description: 'Die Änderungen werden sofort wirksam.',
    });
    setHasChanges(false);
    
    // Reload to apply changes
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  const handleReset = () => {
    setFlags({});
    localStorage.removeItem('feature_flags_override');
    toast({
      title: 'Feature Flags zurückgesetzt',
      description: 'Alle Flags verwenden jetzt die Standard-Werte.',
    });
    setHasChanges(false);
    
    // Reload to apply changes
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  const activeCount = FEATURE_FLAG_CONFIGS.filter((f) => isActive(f.key)).length;
  const totalCount = FEATURE_FLAG_CONFIGS.length;

  return (
    <div className="container max-w-4xl py-8">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Feature Flags (Admin)</h1>
          <p className="text-muted-foreground">
            Steuere experimentelle und Beta-Features
          </p>
        </div>
      </div>

      <Alert className="mb-6">
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Hinweis:</strong> Änderungen werden lokal gespeichert und
          überschreiben die Standard-Werte. Die Seite wird nach dem Speichern neu geladen.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {activeCount} / {totalCount} Features aktiv
          </Badge>
          {hasChanges && (
            <Badge variant="outline" className="text-warning">
              Nicht gespeichert
            </Badge>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={Object.keys(flags).length === 0}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges}
          >
            <Save className="h-4 w-4 mr-2" />
            Speichern
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {FEATURE_FLAG_CONFIGS.map((config) => {
          const active = isActive(config.key);
          const isOverridden = flags[config.key] !== undefined;

          return (
            <Card key={config.key}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch
                      id={config.key}
                      checked={active}
                      onCheckedChange={() => toggleFlag(config.key)}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={config.key} className="text-base font-semibold cursor-pointer">
                          {config.label}
                        </Label>
                        {isOverridden && (
                          <Badge variant="outline" className="text-xs">
                            Override
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="mt-1">
                        {config.description}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant={active ? 'default' : 'secondary'}>
                    {active ? 'Aktiv' : 'Deaktiviert'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                    FEATURE_FLAGS.{config.key}
                  </span>
                  <span>→</span>
                  <span className={active ? 'text-green-600' : 'text-red-600'}>
                    {active ? 'true' : 'false'}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
