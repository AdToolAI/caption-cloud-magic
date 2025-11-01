-- Add phone number field to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Add email verified tracking (for UI display)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- Create function to sync email_verified from auth.users
CREATE OR REPLACE FUNCTION sync_email_verified()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles 
  SET email_verified = (
    SELECT email_confirmed_at IS NOT NULL 
    FROM auth.users 
    WHERE id = NEW.id
  )
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to update email_verified when user verifies email
DROP TRIGGER IF EXISTS on_auth_user_email_verified ON auth.users;
CREATE TRIGGER on_auth_user_email_verified
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_email_verified();

-- Initial sync of email_verified for existing users
UPDATE public.profiles p
SET email_verified = (
  SELECT email_confirmed_at IS NOT NULL 
  FROM auth.users u 
  WHERE u.id = p.id
);