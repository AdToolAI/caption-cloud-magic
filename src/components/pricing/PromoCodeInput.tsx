import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';

interface PromoCodeInputProps {
  onCodeApplied?: (code: string, discount: number) => void;
  onCodeRemoved?: () => void;
}

export function PromoCodeInput({ onCodeApplied, onCodeRemoved }: PromoCodeInputProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [validating, setValidating] = useState(false);
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [discount, setDiscount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    if (!code.trim()) return;

    setValidating(true);
    setError(null);

    try {
      const { data, error: funcError } = await supabase.functions.invoke('validate-promo-code', {
        body: { code: code.trim().toUpperCase() }
      });

      if (funcError) throw funcError;

      if (data?.valid) {
        setAppliedCode(code.trim().toUpperCase());
        setDiscount(data.discount_percent);
        setCode('');
        onCodeApplied?.(code.trim().toUpperCase(), data.discount_percent);
      } else {
        setError(t('pricing.promo.invalid'));
      }
    } catch (err: any) {
      console.error('Failed to validate promo code:', err);
      setError(err.message || t('pricing.promo.error'));
    } finally {
      setValidating(false);
    }
  };

  const handleRemove = () => {
    setAppliedCode(null);
    setDiscount(null);
    setError(null);
    onCodeRemoved?.();
  };

  if (appliedCode && discount) {
    return (
      <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
        <Check className="w-4 h-4 text-green-600" />
        <span className="text-sm font-medium text-green-900 dark:text-green-100">
          {t('pricing.promo.applied')}: <strong>{appliedCode}</strong> (−{discount}% {t('pricing.promo.for3months')})
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRemove}
          className="ml-auto h-6 w-6 p-0"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder={t('pricing.promo.placeholder')}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleValidate()}
          className="flex-1"
          disabled={validating}
        />
        <Button
          onClick={handleValidate}
          disabled={!code.trim() || validating}
          variant="outline"
        >
          {validating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            t('pricing.promo.apply')
          )}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <p className="text-xs text-muted-foreground">
        {t('pricing.promo.hint')}
      </p>
    </div>
  );
}
