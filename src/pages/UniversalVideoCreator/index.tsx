import { Helmet } from "react-helmet-async";
import { UniversalVideoWizard } from "@/components/universal-video-creator";
import { useTranslation } from "@/hooks/useTranslation";

const UniversalVideoCreator = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t('uvc.pageTitle')}</title>
        <meta name="description" content={t('uvc.pageMeta')} />
      </Helmet>
      <UniversalVideoWizard />
    </>
  );
};

export default UniversalVideoCreator;
