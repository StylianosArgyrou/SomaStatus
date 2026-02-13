import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://status.somaweather.com',
  vite: {
    plugins: [tailwindcss()],
  },
});
