import { Helmet } from 'react-helmet-async';
import { MarketplaceTemplateGallery } from '@/components/marketplace/MarketplaceTemplateGallery';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import type { MarketplaceTemplate } from '@/types/marketplace';

export default function Marketplace() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSelected = (t: MarketplaceTemplate) => {
    // Persist selection so the composer can pick it up
    try {
      sessionStorage.setItem('marketplace.selectedTemplateId', t.id);
    } catch {/* noop */}
    toast({ title: 'Template ready', description: 'Opening Motion Studio with your template…' });
    navigate('/video-composer');
  };

  return (
    <>
      <Helmet>
        <title>Template Marketplace | AdTool</title>
        <meta name="description" content="Entdecke Community-Templates für Motion Studio. Free oder Premium — Creator verdienen 70% pro Verkauf." />
      </Helmet>
      <div className="container mx-auto py-8">
        <MarketplaceTemplateGallery onTemplateSelected={handleSelected} />
      </div>
    </>
  );
}
