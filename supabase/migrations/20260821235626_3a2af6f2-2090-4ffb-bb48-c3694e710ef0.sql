CREATE TABLE public.v434_artifact_pins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scene_id UUID,
  run_id TEXT,
  generation INTEGER,
  pass_idx INTEGER,
  kind TEXT NOT NULL,
  source_url TEXT,
  object_key TEXT,
  pinned_url TEXT,
  sha256 TEXT,
  byte_size BIGINT,
  status TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX v434_artifact_pins_scene_run_idx ON public.v434_artifact_pins (scene_id, run_id, pass_idx);
CREATE UNIQUE INDEX v434_artifact_pins_object_key_idx ON public.v434_artifact_pins (object_key) WHERE object_key IS NOT NULL;

GRANT ALL ON public.v434_artifact_pins TO service_role;
GRANT SELECT ON public.v434_artifact_pins TO authenticated;

ALTER TABLE public.v434_artifact_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read artifact pins"
ON public.v434_artifact_pins
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));