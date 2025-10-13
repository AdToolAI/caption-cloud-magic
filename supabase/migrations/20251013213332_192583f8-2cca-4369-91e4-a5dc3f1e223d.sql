-- Create or replace the monthly credit reset function
CREATE OR REPLACE FUNCTION public.reset_monthly_credits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.wallets
  SET 
    balance = monthly_credits,
    last_reset_at = now(),
    updated_at = now()
  WHERE 
    last_reset_at < date_trunc('month', now());
END;
$$;