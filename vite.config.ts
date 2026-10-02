import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  // `vite build --mode cloudflare`: the Firebase SDK imports resolve to our own small stand-ins
  // (src/shims), which talk to the Worker's /api/db. Every other mode keeps the real Firebase SDK.
  const cloudflare = mode === 'cloudflare';
  const shim = (name: string) => path.resolve(__dirname, 'src/shims', name);
  return {
    plugins: [react(), tailwindcss()],
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