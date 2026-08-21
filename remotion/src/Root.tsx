import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="main"
      component={MainVideo}
      durationInFrames={912}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ lang: "en" as const }}
    />
    <Composition
      id="main-de"
      component={MainVideo}
      durationInFrames={912}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ lang: "de" as const }}
    />
  </>
);
