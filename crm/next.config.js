/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fotos (5 MB), catálogos PDF (20 MB) y la hoja del inventario suben por acciones del servidor (F3·9).
  experimental: { serverActions: { bodySizeLimit: '21mb' } },
}

module.exports = nextConfig
