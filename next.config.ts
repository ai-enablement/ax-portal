import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  outputFileTracingIncludes: { '/api/native-agent/**/*': ['./server/vendor/intake-agent/**/*'] },
};

export default nextConfig;
