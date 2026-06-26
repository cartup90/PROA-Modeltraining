import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/PROA-Modeltraining/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        drivesafe: resolve(__dirname, 'drivesafe/index.html'),
        lenguadesenas: resolve(__dirname, 'lenguadesenas/index.html'),
        "evitar-phishing": resolve(__dirname, 'evitar-phishing/index.html'),
        "identificador-billetes": resolve(__dirname, 'identificador-billetes/index.html'),
      },
    },
  },
});
