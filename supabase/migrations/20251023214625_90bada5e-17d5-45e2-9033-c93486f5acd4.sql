-- Fix security warning: Set search_path for create_user_storage function
CREATE OR REPLACE FUNCTION create_user_storage()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_storage (user_id, quota_mb, used_mb)
  VALUES (NEW.id, 2048, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;