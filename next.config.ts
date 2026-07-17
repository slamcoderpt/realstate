import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{key: 'X-Robots-Tag', value: 'noindex, nofollow'}]
      }
    ];
  }
};

export default withNextIntl(nextConfig);
