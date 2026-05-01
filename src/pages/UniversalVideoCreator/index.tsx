import { Helmet } from "react-helmet-async";
import { UniversalVideoWizard } from "@/components/universal-video-creator";
import { useTranslation } from "@/hooks/useTranslation";
import { useTrackPageFeature } from "@/hooks/useTrackPageFeature";

const UniversalVideoCreator = () => {
  const { t } = useTranslation();
  useTrackPageFeature('universal_video_creator');
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
