/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No sharp installed; serve images as-is (avoids prod image-optimizer dependency).
  images: { unoptimized: true },
};
export default nextConfig;
