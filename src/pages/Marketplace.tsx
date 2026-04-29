import { Helmet } from 'react-helmet-async';
import { useState } from 'react';
import { MarketplaceTemplateGallery } from '@/components/marketplace/MarketplaceTemplateGallery';
import { CharacterMarketplaceGallery } from '@/components/marketplace/CharacterMarketplaceGallery';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Store, Users } from 'lucide-react';
import type { MarketplaceTemplate } from '@/types/marketplace';

export default function Marketplace() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState<'templates' | 'characters'>('templates');

  const handleTemplateSelected = (t: MarketplaceTemplate) => {
    try { sessionStorage.setItem('marketplace.selectedTemplateId', t.id); } catch {/* noop */}
    toast({ title: 'Template ready', description: 'Opening Motion Studio…' });
    navigate('/video-composer');
  };

  return (
    <>
      <Helmet>
        <title>Marketplace — Templates & Characters | AdTool</title>
        <meta name="description" content="Discover community-created scene templates and brand characters. Earn 70% revenue share when others buy yours." />
      </Helmet>
      <div className="container mx-auto py-8 space-y-6">
        <header>
          <h1 className="text-3xl font-bold">Marketplace</h1>
          <p className="text-sm text-muted-foreground mt-1">Templates and brand characters from the community. Strict legal safeguards on every listing.</p>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'templates' | 'characters')}>
          <TabsList>
            <TabsTrigger value="templates"><Store className="h-4 w-4 mr-2" />Templates</TabsTrigger>
            <TabsTrigger value="characters"><Users className="h-4 w-4 mr-2" />Characters</TabsTrigger>
          </TabsList>
          <TabsContent value="templates" className="mt-6">
            <MarketplaceTemplateGallery onTemplateSelected={handleTemplateSelected} />
          </TabsContent>
          <TabsContent value="characters" className="mt-6">
            <CharacterMarketplaceGallery />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
