import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    // project media carries a ?v= cache-buster; thumbnails are requested through /_next/image
    localPatterns: [{ pathname: "/media/**" }, { pathname: "/uploads/**" }],
  },
  experimental: { serverActions: { bodySizeLimit: "60mb" } },
  // a deployment without Supabase reads this snapshot (DB_FILE=deploy/db.json)
  outputFileTracingIncludes: { "/**": ["./deploy/db.json"] },
  async headers() {
    return [
      {
        source: "/media/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
