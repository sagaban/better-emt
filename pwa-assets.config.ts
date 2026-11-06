import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// maskable-icon-512x512.png y apple-touch-icon-180x180.png se generan a partir de
// public/icon-maskable.svg (a sangre completa) y no se tocan aquí.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, sizes: [] },
    apple: { ...minimal2023Preset.apple, sizes: [] },
  },
  images: ['public/icon.svg'],
})
