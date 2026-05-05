ALTER TABLE public.text_studio_conversations
  ADD COLUMN IF NOT EXISTS parent_conversation_id uuid REFERENCES public.text_studio_conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS branched_from_message_id uuid,
  ADD COLUMN IF NOT EXISTS branch_label text;

CREATE INDEX IF NOT EXISTS idx_tsc_parent ON public.text_studio_conversations(parent_conversation_id);