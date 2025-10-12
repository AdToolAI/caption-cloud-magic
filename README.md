# CaptionGenie 🎯

[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)]()
[![React](https://img.shields.io/badge/React-18.3-61dafb)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

CaptionGenie is a comprehensive AI-powered social media management platform that helps content creators, marketers, and businesses streamline their social media workflow from content creation to analytics.

## ✨ Key Features

### 🤖 AI-Powered Content Creation
- **Smart Caption Generator**: Generate engaging captions tailored to your brand voice
- **Hook Generator**: Create attention-grabbing opening lines for your posts
- **Bio Optimizer**: Craft compelling social media bios
- **Reel Script Generator**: Generate scripts for short-form video content
- **Image-Caption Pairing**: AI analyzes images and suggests matching captions
- **AI Post Generator**: Complete post generation from images with vision AI

### 📅 Content Management
- **Smart Calendar**: Visual content calendar with drag-and-drop scheduling
- **Recurring Posts**: Automate regular content with customizable schedules
- **Queue Management**: Batch schedule posts and manage posting queue
- **Post Time Advisor**: AI-powered recommendations for optimal posting times
- **Multi-Platform Support**: Instagram, TikTok, LinkedIn, Twitter, Facebook

### 📊 Analytics & Insights
- **Performance Tracker**: Track post performance across all platforms
- **Advanced Analytics**: Deep dive into engagement, reach, and conversion metrics
- **Hashtag Performance**: Track which hashtags drive the most engagement
- **Content Audit**: Analyze your content strategy and get improvement suggestions
- **ROI Tracking**: Monitor campaign performance and return on investment

### 🎨 Creative Tools
- **Carousel Creator**: Design multi-slide carousel posts
- **Background Replacer**: AI-powered background removal and replacement
- **Media Library**: Organize and manage all your content assets
- **Brand Kit**: Store brand colors, fonts, logos, and voice guidelines
- **Template Library**: Reusable content templates

### 👥 Team Collaboration
- **Team Workspaces**: Separate workspaces for different projects/clients
- **Role Management**: Owner, Admin, Editor, and Viewer roles
- **Content Approval Workflow**: Submit, review, and approve content
- **Task Management**: Assign and track content creation tasks

### 📈 Growth & Optimization
- **Goals Dashboard**: Set and track social media goals
- **Trend Radar**: Discover trending topics in your niche
- **Comment Manager**: Centralized comment management with AI replies
- **Engagement Coach**: Get personalized coaching to improve your strategy

### ⚙️ Advanced Features
- **White-Label Options**: Custom branding for agencies
- **Multi-Language Support**: English, German, Spanish
- **Dark/Light Mode**: Comfortable viewing in any lighting
- **PWA Support**: Install as a mobile app
- **Command Palette**: Quick access to all features (Cmd/Ctrl + K)

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- npm or bun package manager
- Lovable Cloud account (free tier available)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/caption-genie.git

# Navigate to project directory
cd caption-genie

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:8080`

### Environment Setup

The project uses Lovable Cloud for backend functionality. No additional environment configuration is needed - authentication, database, storage, and edge functions are automatically configured.

## 🏗️ Architecture

### Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, shadcn/ui components
- **Backend**: Lovable Cloud (Supabase-powered)
- **Database**: PostgreSQL with Row-Level Security
- **Authentication**: Built-in auth with email/password and social providers
- **Storage**: Cloud file storage for images and media
- **AI**: Multiple AI models (Gemini, GPT-4) via Lovable AI
- **State Management**: TanStack Query (React Query)
- **Routing**: React Router v6
- **Testing**: Vitest, React Testing Library

### Project Structure

```
caption-genie/
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── ui/           # shadcn/ui base components
│   │   ├── analytics/    # Analytics components
│   │   ├── bio/          # Bio optimization components
│   │   ├── calendar/     # Calendar components
│   │   ├── dashboard/    # Dashboard widgets
│   │   ├── onboarding/   # User onboarding
│   │   ├── performance/  # Performance tracking
│   │   ├── scheduler/    # Post scheduling
│   │   └── team/         # Team collaboration
│   ├── pages/            # Route pages
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utility functions
│   ├── integrations/     # Backend integrations
│   ├── data/             # Static data and fixtures
│   └── test/             # Test utilities and setup
├── supabase/
│   ├── functions/        # Edge functions (serverless)
│   └── migrations/       # Database migrations
└── public/               # Static assets
```

## 🧪 Testing

The project includes comprehensive test coverage using Vitest and React Testing Library.

### Test Coverage

We maintain >80% test coverage for critical paths:
- Component rendering and interactions
- Custom hooks logic
- Utility functions
- Edge function handlers

## 📚 Documentation

### For Users
- Complete user guide and feature documentation available
- FAQ and troubleshooting guides
- Video tutorials for key features

### For Developers
- [Contributing Guide](CONTRIBUTING.md) - How to contribute
- [API Documentation](docs/api/edge-functions.md) - Edge function API reference
- Database schema documentation
- Architecture decision records

## 🔐 Security

- Row-Level Security (RLS) enabled on all tables
- Secure authentication with encrypted sessions
- API rate limiting to prevent abuse
- Input validation and sanitization
- CORS configuration for API endpoints
- Regular security audits

## 🌐 Internationalization

CaptionGenie supports multiple languages:
- English (en)
- German (de)
- Spanish (es)

Language files are located in `src/lib/translations.ts`.

## 🎨 Design System

CaptionGenie uses a comprehensive design system:
- Semantic color tokens (defined in `src/index.css`)
- HSL color format for all colors
- Consistent spacing and typography
- Dark/light mode support
- Accessible components (WCAG 2.1 AA compliant)

## 📦 Deployment

### Deploy to Production

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

The app can be deployed to any static hosting service (Vercel, Netlify, etc.) or via Lovable's built-in deployment.

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write/update tests
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Built with [Lovable](https://lovable.dev)
- UI components by [shadcn/ui](https://ui.shadcn.com)
- Icons by [Lucide](https://lucide.dev)
- Charts by [Recharts](https://recharts.org)

## 📞 Support

- 📧 Email: support@captiongenie.com
- 💬 Discord: Join our community
- 🐦 Twitter: @CaptionGenie
- 📖 Documentation: Complete guides available

## 🗺️ Roadmap

- [ ] Instagram API integration for direct posting
- [ ] TikTok API integration
- [ ] Video content scheduling
- [ ] Advanced A/B testing for captions
- [ ] AI-powered content recommendations
- [ ] Mobile app (iOS & Android)
- [ ] Browser extension
- [ ] Zapier integration

---

Made with ❤️ by the CaptionGenie team
