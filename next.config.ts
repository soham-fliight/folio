import type { NextConfig } from "next";

const pages = process.env.GITHUB_PAGES === "true";
const basePath = pages ? "/folio" : "";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

if (pages) {
  nextConfig.output = "export";
  nextConfig.basePath = basePath;
  nextConfig.trailingSlash = true;
} else {
  nextConfig.serverExternalPackages = ["pdfjs-dist"];
  nextConfig.allowedDevOrigins = ["127.0.0.1"];
  nextConfig.rewrites = async () => [{ source: "/favicon.ico", destination: "/favicon.svg" }];
}

export default nextConfig;
