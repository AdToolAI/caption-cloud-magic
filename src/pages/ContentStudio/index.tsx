import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Video, MessageSquare, Play, Wand2, Plus, ArrowRight } from 'lucide-react';

export default function ContentStudioHub() {
  const navigate = useNavigate();

  const CONTENT_TYPES = [
    {
      id: 'ads',
      icon: Video,
      title: 'Werbevideos',
      description: 'Produkt-Showcases, Angebote, Sales',
      route: '/content-studio/ads',
      color: 'bg-gradient-to-br from-blue-500 to-cyan-500',
      templates: 12
    },
    {
      id: 'stories',
      icon: MessageSquare,
      title: 'Stories',
      description: 'Instagram & TikTok Stories',
      route: '/content-studio/stories',
      color: 'bg-gradient-to-br from-pink-500 to-rose-500',
      templates: 8
    },
    {
      id: 'reels',
      icon: Play,
      title: 'Reels & Shorts',
      description: 'Virale Kurzvideos',
      route: '/content-studio/reels',
      color: 'bg-gradient-to-br from-purple-500 to-indigo-500',
      templates: 15
    },
    {
      id: 'custom',
      icon: Wand2,
      title: 'Eigenes Template',
      description: 'Erstelle dein eigenes Template',
      route: '/content-studio/editor',
      color: 'bg-gradient-to-br from-green-500 to-emerald-500',
      templates: '∞'
    }
  ];

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">Content Studio</h1>
          <p className="text-muted-foreground mt-2">
            Erstelle professionelle Videos für alle Plattformen
          </p>
        </div>
        <Button onClick={() => navigate('/content-studio/editor')} size="lg">
          <Plus className="h-5 w-5 mr-2" />
          Template erstellen
        </Button>
      </div>

      {/* Content Type Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {CONTENT_TYPES.map(type => (
          <Card
            key={type.id}
            className="group cursor-pointer overflow-hidden hover:shadow-2xl transition-all"
            onClick={() => navigate(type.route)}
          >
            <div className={`${type.color} h-40 flex items-center justify-center relative`}>
              <type.icon className="h-20 w-20 text-white group-hover:scale-110 transition-transform" />
              <div className="absolute top-3 right-3">
                <Badge variant="secondary" className="bg-white/20 text-white backdrop-blur-sm">
                  {type.templates} Templates
                </Badge>
              </div>
            </div>
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold mb-2">{type.title}</h3>
              <p className="text-sm text-muted-foreground">{type.description}</p>
              <div className="mt-4 flex items-center text-primary font-medium">
                Jetzt erstellen
                <ArrowRight className="h-4 w-4 ml-2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
