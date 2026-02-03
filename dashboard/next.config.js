/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // 允许跨域请求 Gateway API
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: 'http://localhost:3000/api/:path*',
            },
        ];
    },
};

module.exports = nextConfig;
