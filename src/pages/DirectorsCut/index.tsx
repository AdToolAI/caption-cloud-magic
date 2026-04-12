import { Helmet } from 'react-helmet-async';
import { useTranslation } from '@/hooks/useTranslation';
import { DirectorsCut } from './DirectorsCut';

export default function DirectorsCutPage() {
  const { t } = useTranslation();
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
