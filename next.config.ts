import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  experimental: {
    // Pior caso legítimo: investidor estrangeiro envia 2 ficheiros de KYC a
    // 8 MB cada (id + comprovativo de morada) = 16 MB, mais o overhead do
    // formulário. Mantemos o limite de transporte acima disso para que um
    // ficheiro demasiado grande seja apanhado pela validação server-side em
    // submitKyc (erro amigável) em vez de ser rejeitado de forma opaca por
    // esta camada antes da Server Action correr.
    serverActions: {bodySizeLimit: '20mb'}
  },
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
