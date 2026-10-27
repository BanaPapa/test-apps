/** @type {import('next').NextConfig} */
const nextConfig = {
  // 이 폴더 밖의 package-lock.json 을 작업 루트로 오인하지 않게 한다.
  turbopack: { root: import.meta.dirname },
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
