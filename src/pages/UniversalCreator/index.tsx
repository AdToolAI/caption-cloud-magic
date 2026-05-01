import { Helmet } from 'react-helmet-async';
import { UniversalCreator } from './UniversalCreator';
import { useTranslation } from '@/hooks/useTranslation';
import { useTrackPageFeature } from '@/hooks/useTrackPageFeature';

export default function UniversalCreatorPage() {
  const { t } = useTranslation();
  useTrackPageFeature('universal_creator');
  return (
    <>
      <Helmet>
        <title>{t('uc.pageTitle')}</title>
        <meta 
          name="description" 
          content={t('uc.pageDesc')} 
        />
      </Helmet>
      <UniversalCreator />
    </>
  );
}
