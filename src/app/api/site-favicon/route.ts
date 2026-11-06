import { GET as getSiteFavicon } from '@/lib/api-routes/site-favicon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return getSiteFavicon();
}
