import { UniversalVideoCreator } from '@/components/content-studio/UniversalVideoCreator';
import { useUserBehavior } from '@/hooks/useUserBehavior';
import { useEffect } from 'react';

export default function ReelsCreator() {
  const { trackEvent } = useUserBehavior();

  useEffect(() => {
    trackEvent('project_create', {}, undefined, 'reel');
  }, []);
  return (
    <div>
      <div className="bg-gradient-to-br from-purple-500 to-indigo-500 py-16 text-white text-center">
        <h1 className="text-5xl font-bold mb-4">Reels & Shorts erstellen</h1>
        <p className="text-xl">Virale Kurzvideos für maximale Reichweite</p>
      </div>
      <UniversalVideoCreator contentType="reel" />
    </div>
  );
}
