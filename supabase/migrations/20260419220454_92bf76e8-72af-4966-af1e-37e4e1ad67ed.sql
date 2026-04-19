-- Bereinige eventuelle Duplikate (behalte jeweils den jüngsten Eintrag pro user_id)
DELETE FROM public.email_verification_tokens a
USING public.email_verification_tokens b
WHERE a.user_id = b.user_id
  AND a.created_at < b.created_at;

-- UNIQUE-Constraint hinzufügen, damit upsert(onConflict: 'user_id') funktioniert
ALTER TABLE public.email_verification_tokens
  ADD CONSTRAINT email_verification_tokens_user_id_key UNIQUE (user_id);