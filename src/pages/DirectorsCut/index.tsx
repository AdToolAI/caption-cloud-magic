import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from '@/hooks/useTranslation';
import { trackFeatureUsage } from '@/lib/featureUsageTracker';
import { DirectorsCut } from './DirectorsCut';

export default function DirectorsCutPage() {
  const { t } = useTranslation();

  useEffect(() => {
    trackFeatureUsage('directors_cut');
  }, []);

  return (
    <>
      <Helmet>
        <title>Universal Director's Cut | Video Post-Production</title>
        <meta 
          name="description" 
          content={t("dc.pageMeta")} 
        />
      </Helmet>
      <DirectorsCut />
    </>
  );
}
