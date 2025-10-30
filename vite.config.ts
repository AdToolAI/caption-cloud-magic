import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React stack
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // UI Components (Radix UI)
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tabs',
            '@radix-ui/react-select',
            '@radix-ui/react-popover',
            '@radix-ui/react-tooltip'
          ],
          // Charts
          'vendor-chart': ['recharts'],
          // Icons
          'vendor-icons': ['lucide-react'],
          // Query & State
          'vendor-query': ['@tanstack/react-query'],
          // Backend
          'vendor-supabase': ['@supabase/supabase-js'],
          // Forms
          'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod']
        },
      },
    },
    // CSS Code Splitting für bessere Performance
    cssCodeSplit: true,
    // Chunk Size Warnings erhöhen für vendor bundles
    chunkSizeWarningLimit: 1000,
    // Source Maps nur in Development
    sourcemap: mode === 'development',
    // Minify für Production
    minify: mode === 'production' ? 'esbuild' : false,
    // Target moderne Browser für kleinere Bundles
    target: 'es2020'
  },
  // Optimierung für Production
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
}));
