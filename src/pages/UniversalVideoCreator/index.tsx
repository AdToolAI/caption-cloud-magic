import { Helmet } from "react-helmet-async";
import { UniversalVideoWizard } from "@/components/universal-video-creator";

const UniversalVideoCreator = () => {
  return (
    <>
      <Helmet>
        <title>Universal Video Creator | AdTool</title>
        <meta name="description" content="Erstelle professionelle Videos mit dem Universal Video Creator - KI-gestützte Videoerstellung mit allen Animationen und Effekten." />
      </Helmet>
      <UniversalVideoWizard />
    </>
  );
};

export default UniversalVideoCreator;
