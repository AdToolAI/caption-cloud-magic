-- First, drop the old check constraint and add a new one that includes 'design'
ALTER TABLE public.feature_registry 
DROP CONSTRAINT IF EXISTS feature_registry_category_check;

ALTER TABLE public.feature_registry
ADD CONSTRAINT feature_registry_category_check 
CHECK (category IN ('create', 'optimize', 'analyze', 'design'));

-- Now insert Design & Visuals features
INSERT INTO public.feature_registry (id, category, route, titles_json, description_json, icon, plan, enabled, "order") VALUES
('image_caption', 'design', '/image-caption', 
  '{"en":"AI Image Caption Pairing","de":"KI Bild-Caption Pairing","es":"Emparejamiento de Subtítulos de Imagen con IA"}',
  '{"en":"Upload a photo and get instant caption ideas","de":"Lade ein Foto hoch und erhalte sofortige Caption-Ideen","es":"Sube una foto y obtén ideas de subtítulos al instante"}',
  'ImagePlus', 'free', false, 31),
  
('carousel_generator', 'design', '/carousel', 
  '{"en":"AI Carousel Generator","de":"KI Karussell-Generator","es":"Generador de Carrusel con IA"}',
  '{"en":"Convert captions into scrollable visual slides","de":"Konvertiere Captions in scrollbare visuelle Slides","es":"Convierte subtítulos en diapositivas visuales deslizables"}',
  'Gallery', 'pro', false, 32),
  
('template_library', 'design', '/templates', 
  '{"en":"Template Library / Brand Kit","de":"Vorlagenbibliothek / Brand Kit","es":"Biblioteca de Plantillas / Kit de Marca"}',
  '{"en":"Access pre-designed templates and brand assets","de":"Zugriff auf vorgefertigte Vorlagen und Marken-Assets","es":"Accede a plantillas prediseñadas y activos de marca"}',
  'BookTemplate', 'pro', false, 33),
  
('brand_visualizer', 'design', '/brand-visualizer', 
  '{"en":"Auto-Brand Visualizer","de":"Auto-Marken-Visualizer","es":"Visualizador de Marca Automático"}',
  '{"en":"Automatically generate on-brand visuals","de":"Generiere automatisch markenkonforme Visuals","es":"Genera automáticamente visuales coherentes con tu marca"}',
  'Brush', 'pro', false, 34),
  
('design_assistant', 'design', '/design-assistant', 
  '{"en":"AI Design Assistant","de":"KI Design-Assistent","es":"Asistente de Diseño con IA"}',
  '{"en":"Get AI-powered design recommendations","de":"Erhalte KI-gestützte Design-Empfehlungen","es":"Obtén recomendaciones de diseño impulsadas por IA"}',
  'Wand2', 'pro', false, 35);