import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// The code of the page a visit starts on (a product page, the checkout, the home page, the shop) is asked for from the HTML itself, side by
// side with the app's main file, instead of only after the app has started: one round trip less before the first
// screen. The file names are known only after the build, so the list is written into index.html here.
const startPagePreload = () => ({
  name: 'sag-start-page-preload',
  transformIndexHtml: {
    order: 'post' as const,
    handler(html: string, ctx: { bundle?: Record<string, any> }) {
      if (!ctx.bundle) return html;
      const chunks = Object.values(ctx.bundle).filter((c: any) => c.type === 'chunk');
      const entry: any = chunks.find((c: any) => c.isEntry);
      const always = new Set<string>(entry ? [entry.fileName, ...entry.imports] : []);
      const filesOf = (page: string) => {
        const chunk: any = chunks.find((c: any) => String(c.facadeModuleId || '').replace(/\\/g, '/').endsWith(`/src/components/${page}.tsx`));
        if (!chunk) return [];
        return [chunk.fileName, ...chunk.imports].filter((file: string) => !always.has(file)).map((file: string) => `/${file}`);
      };
      const map = { product: filesOf('ProductDetailPage'), checkout: filesOf('CheckoutPage'), home: filesOf('HomePage'), shop: filesOf('ShopPage') };
      const script = `<script>(function(){try{var m=${JSON.stringify(map)},p=location.pathname,k=p==='/'?'home':p.indexOf('/product/')===0?'product':p.indexOf('/checkout')===0?'checkout':/^\\/(shop|category\\/)/.test(p)?'shop':'';(m[k]||[]).forEach(function(h){var l=document.createElement('link');l.rel='modulepreload';l.href=h;document.head.appendChild(l)})}catch(e){}})();</script>`;
      return html.replace('</head>', `  ${script}\n  </head>`);
    },
  },
});

export default defineConfig(({ mode }) => {
  // `vite build --mode cloudflare`: the Firebase SDK imports resolve to our own small stand-ins
  // (src/shims), which talk to the Worker's /api/db. Every other mode keeps the real Firebase SDK.
  const cloudflare = mode === 'cloudflare';
  const shim = (name: string) => path.resolve(__dirname, 'src/shims', name);
  return {
    plugins: [react(), tailwindcss(), startPagePreload()],
    // Cloudflare's Git build has no build variables set, so Google sign-in is on there unless switched off
    define: cloudflare ? { 'import.meta.env.VITE_GOOGLE_LOGIN': JSON.stringify(process.env.VITE_GOOGLE_LOGIN ?? '1') } : {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        ...(cloudflare ? {
          'firebase/app': shim('firebase-app.ts'),
          'firebase/auth': shim('firebase-auth.ts'),
          'firebase/firestore': shim('firebase-firestore.ts'),
          'firebase/analytics': shim('firebase-analytics.ts'),
        } : {}),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Vendor code changes rarely, so it is cached separately from app code.
          manualChunks: {
            react: ['react', 'react-dom'],
            ...(cloudflare ? {} : { firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'] }),
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});