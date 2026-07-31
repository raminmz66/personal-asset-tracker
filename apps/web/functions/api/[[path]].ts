type ApiFetcher = {
  fetch: (request: Request) => Promise<Response>
}

type PagesContext = {
  request: Request
  env: { API?: ApiFetcher }
}

/** Proxy /api/* to the personal-asset-tracker-api Worker (service binding). */
export async function onRequest(context: PagesContext): Promise<Response> {
  if (!context.env.API) {
    return new Response('API binding missing', { status: 500 })
  }
  return context.env.API.fetch(context.request)
}
