// Fonction serverless (Vercel) qui expose un petit JSON public
// avec le morceau Spotify en cours d'écoute, ou le dernier écouté.
//
// Variables d'environnement à définir sur Vercel :
//   SPOTIFY_CLIENT_ID
//   SPOTIFY_CLIENT_SECRET
//   SPOTIFY_REFRESH_TOKEN
//
// Endpoint résultant, une fois déployé : https://ton-projet.vercel.app/api/now-playing

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const NOW_PLAYING_URL = 'https://api.spotify.com/v1/me/player/currently-playing';
const RECENTLY_PLAYED_URL = 'https://api.spotify.com/v1/me/player/recently-played?limit=1';

async function getAccessToken() {
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
    }),
  });

  if (!response.ok) {
    throw new Error('Impossible de rafraîchir le token Spotify');
  }

  const data = await response.json();
  return data.access_token;
}

export default async function handler(req, res) {
  // le site statique doit pouvoir appeler cet endpoint depuis un autre domaine
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');

  try {
    const accessToken = await getAccessToken();
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    const nowPlayingRes = await fetch(NOW_PLAYING_URL, { headers: authHeader });

    // 204 = rien en cours de lecture
    if (nowPlayingRes.status === 200) {
      const track = await nowPlayingRes.json();
      if (track && track.item) {
        return res.status(200).json({
          isPlaying: true,
          title: track.item.name,
          artist: track.item.artists.map((a) => a.name).join(', '),
          url: track.item.external_urls.spotify,
        });
      }
    }

    // sinon on retombe sur le dernier morceau écouté
    const recentRes = await fetch(RECENTLY_PLAYED_URL, { headers: authHeader });
    const recentData = await recentRes.json();
    const last = recentData.items && recentData.items[0];

    if (last) {
      return res.status(200).json({
        isPlaying: false,
        title: last.track.name,
        artist: last.track.artists.map((a) => a.name).join(', '),
        url: last.track.external_urls.spotify,
      });
    }

    return res.status(200).json({ isPlaying: false, title: null, artist: null, url: null });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
