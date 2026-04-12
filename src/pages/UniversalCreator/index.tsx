import { Helmet } from 'react-helmet-async';
import { UniversalCreator } from './UniversalCreator';
import { useTranslation } from '@/hooks/useTranslation';

export default function UniversalCreatorPage() {
  const { t } = useTranslation();
  
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
