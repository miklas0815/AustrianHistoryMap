import { defineConfig } from 'vite';

// Relative Pfade, damit der Build in jedem Unterordner des Webspace läuft.
// Zwei Seiten: die Zeitleiste und die Redaktionsseite zum Bearbeiten der Daten.
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: { main: 'index.html', redaktion: 'redaktion.html' },
    },
  },
});
