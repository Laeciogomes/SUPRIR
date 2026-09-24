const OFFICIAL_HOST = 'suprir.caninde.codeedu.dev';
const PAGES_ALIASES = new Set([
  'suprir.pages.dev',
  'sistema-materiais-caninde.pages.dev',
]);

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (PAGES_ALIASES.has(url.hostname)) {
    url.hostname = OFFICIAL_HOST;
    url.protocol = 'https:';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
}
