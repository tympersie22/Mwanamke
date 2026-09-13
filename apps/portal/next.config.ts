import type { NextConfig } from "next";
import path from "node:path";

const monorepoRoot = path.resolve(process.cwd(), "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  transpilePackages: ["@mwanamke/domain", "@mwanamke/i18n", "@mwanamke/security"],
  poweredByHeader: false,
  experimental: { optimizePackageImports: ["lucide-react"] },
  async headers() {
    const production = process.env.NODE_ENV === "production";
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'${production ? "" : " http://localhost:4100 ws://localhost:*"}; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; manifest-src 'self'${production ? "; upgrade-insecure-requests" : ""}` },
      ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : [])
    ];
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }] },
      { source: "/logout", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }] },
      { source: "/auth/:path*", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }] }
    ];
  }
};

export default nextConfig;
