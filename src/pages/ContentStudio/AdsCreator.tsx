import { UniversalVideoCreator } from '@/components/content-studio/UniversalVideoCreator';
import { useUserBehavior } from '@/hooks/useUserBehavior';
import { useEffect } from 'react';

export default function AdsCreator() {
  const { trackEvent } = useUserBehavior();

  useEffect(() => {
    trackEvent('project_create', {}, undefined, 'ad');
  }, []);
  return (
    <div>
      <div className="bg-gradient-to-br from-blue-500 to-cyan-500 py-16 text-white text-center">
        <h1 className="text-5xl font-bold mb-4">Werbevideos erstellen</h1>
        <p className="text-xl">Produkt-Showcases, Angebote & Sales-Videos</p>
      </div>
      <UniversalVideoCreator contentType="ad" />
    </div>
  );
}
