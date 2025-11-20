import { UniversalVideoCreator } from '@/components/content-studio/UniversalVideoCreator';

export default function AdsCreator() {
  return (
    <div>
      <div className="bg-gradient-to-br from-blue-500 to-cyan-500 py-16 text-white text-center">
        <h1 className="text-5xl font-bold mb-4">Werbevideos erstellen</h1>
        <p className="text-xl">Produkt-Showcases, Angebote & Sales-Videos</p>
      </div>
      <UniversalVideoCreator contentType="ad" />
    </div>
  );
}
