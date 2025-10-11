-- Fix search_path for increment_usage function
CREATE OR REPLACE FUNCTION increment_usage(user_id_param UUID, date_param DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count INTEGER;
BEGIN
  INSERT INTO public.usage (user_id, date, count)
  VALUES (user_id_param, date_param, 1)
  ON CONFLICT (user_id, date)
  DO UPDATE SET count = public.usage.count + 1
  RETURNING count INTO current_count;
  
  RETURN current_count;
END;
$$;