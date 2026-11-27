// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  session: false,
  adapter: cloudflare({
    // Images are served directly from R2, not through Cloudflare Images.
    imageService: 'passthrough',
  }),
  integrations: [preact()],
  vite: {
    plugins: [tailwindcss()],
  },
});
