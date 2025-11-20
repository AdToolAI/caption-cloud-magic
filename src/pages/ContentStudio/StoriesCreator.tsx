import { UniversalVideoCreator } from '@/components/content-studio/UniversalVideoCreator';

export default function StoriesCreator() {
  return (
    <div>
      <div className="bg-gradient-to-br from-pink-500 to-rose-500 py-16 text-white text-center">
        <h1 className="text-5xl font-bold mb-4">Stories erstellen</h1>
        <p className="text-xl">Instagram & TikTok Stories im 9:16 Format</p>
      </div>
      <UniversalVideoCreator contentType="story" />
    </div>
  );
}
