import { Helmet } from 'react-helmet-async';
import { DirectorsCut } from './DirectorsCut';

export default function DirectorsCutPage() {
  return (
    <>
      <Helmet>
        <title>Universal Director's Cut | Video Post-Production</title>
        <meta 
          name="description" 
          content="Professionelle Video-Nachbearbeitung mit KI-Szenenanalyse, Farbkorrektur, Filter und Audio-Enhancement" 
        />
      </Helmet>
      <DirectorsCut />
    </>
  );
}
