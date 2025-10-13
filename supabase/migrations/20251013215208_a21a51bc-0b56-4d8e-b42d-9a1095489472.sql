-- Create increment_balance function for atomic balance updates
CREATE OR REPLACE FUNCTION public.increment_balance(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE public.wallets
  SET 
    balance = balance + p_amount,
    updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;
  
  RETURN v_new_balance;
END;
$$;