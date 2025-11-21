import { Helmet } from 'react-helmet-async';
import { UniversalCreator } from './UniversalCreator';

export default function UniversalCreatorPage() {
  return (
    <>
      <Helmet>
        <title>Universal Content Creator | Video erstellen</title>
        <meta 
          name="description" 
          content="Erstelle professionelle Videos mit Voice-over, Untertiteln und Multi-Format Export für alle Social Media Plattformen" 
        />
      </Helmet>
      <UniversalCreator />
    </>
  );
}
