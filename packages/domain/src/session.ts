/**
 * How long a signed-in session lasts.
 *
 * Shared so the api's cookie lifetime and the web app's offline unlock marker
 * cannot drift apart: if the cookie outlives the marker the app locks itself
 * out offline, and if the marker outlives the cookie it unlocks a session the
 * server will reject on the next request.
 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
