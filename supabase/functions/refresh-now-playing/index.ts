// Edge Function Supabase — met à jour la table now_playing depuis Spotify.
// Déclenchée par une tâche planifiée (cron), pas appelée directement par le site.
//
// Variables d'environnement à définir avec `supabase secrets set` :
//   SPOTIFY_CLIENT_ID
//   SPOTIFY_CLIENT_SECRET
//   SPOTIFY_REFRESH_TOKEN
// (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont déjà fournis automatiquement
// par Supabase à l'intérieur d'une Edge Function)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const NOW_PLAYING_URL = 'https://api.spotify.com/v1/me/player/currently-playing';
const RECENTLY_PLAYED_URL = 'https://api.spotify.com/v1/me/player/recently-played?limit=1';

async function getAccessToken() {
  const basic = btoa(`${Deno.env.get('SPOTIFY_CLIENT_ID')}:${Deno.env.get('SPOTIFY_CLIENT_SECRET')}`);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: Deno.env.get('SPOTIFY_REFRESH_TOKEN') ?? '',
    }),
  });

  if (!res.ok) throw new Error('refresh token Spotify invalide ou expiré');
  const data = await res.json();
  return data.access_token;
}

Deno.serve(async () => {
  try {
    const accessToken = await getAccessToken();
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    let payload = { is_playing: false, title: null, artist: null, url: null, cover_url: null };

    const nowRes = await fetch(NOW_PLAYING_URL, { headers: authHeader });

    if (nowRes.status === 200) {
      const track = await nowRes.json();
      if (track?.item) {
        payload = {
          is_playing: true,
          title: track.item.name,
          artist: track.item.artists.map((a: { name: string }) => a.name).join(', '),
          url: track.item.external_urls.spotify,
          cover_url: track.item.album?.images?.[0]?.url ?? null,
        };
      }
    }

    if (!payload.title) {
      const recentRes = await fetch(RECENTLY_PLAYED_URL, { headers: authHeader });
      const recentData = await recentRes.json();
      const last = recentData.items?.[0];
      if (last) {
        payload = {
          is_playing: false,
          title: last.track.name,
          artist: last.track.artists.map((a: { name: string }) => a.name).join(', '),
          url: last.track.external_urls.spotify,
          cover_url: last.track.album?.images?.[0]?.url ?? null,
        };
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error } = await supabase
      .from('now_playing')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', 1);

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, ...payload }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
