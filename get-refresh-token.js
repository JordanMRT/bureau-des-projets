// Script à lancer UNE SEULE FOIS en local pour récupérer ton refresh token Spotify.
// Ensuite tu peux le jeter, tu n'en as plus besoin.
//
// 1. Dans ton app sur developer.spotify.com/dashboard, ajoute cette Redirect URI
//    exactement telle quelle : http://127.0.0.1:8888/callback
// 2. Remplis CLIENT_ID et CLIENT_SECRET juste en dessous
// 3. Lance :  node get-refresh-token.js
// 4. Le script ouvre une URL à coller dans ton navigateur (ou clique dessus)
// 5. Connecte-toi, autorise l'app
// 6. Le refresh token s'affiche dans le terminal — copie-le dans les
//    variables d'environnement Vercel (SPOTIFY_REFRESH_TOKEN)

const http = require('http');

const CLIENT_ID = 'f0a9701fb608498597da4e5b4f541f57';
const CLIENT_SECRET = 'b820d818120a4af3b560b423e5c72ec7';
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const SCOPE = 'user-read-currently-playing user-read-recently-played user-read-playback-state';

const authorizeUrl =
  'https://accounts.spotify.com/authorize?' +
  new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPE,
    redirect_uri: REDIRECT_URI,
  }).toString();

console.log('\nOuvre cette URL dans ton navigateur pour autoriser l\'app :\n');
console.log(authorizeUrl);
console.log('\nEn attente de l\'autorisation...\n');

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/callback')) {
    res.end('ok');
    return;
  }

  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.end('Autorisation refusée, tu peux fermer cet onglet.');
    console.error('Erreur retournée par Spotify :', error);
    server.close();
    return;
  }

  try {
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const data = await tokenRes.json();

    if (data.refresh_token) {
      res.end('C\'est bon, tu peux fermer cet onglet et retourner dans le terminal.');
      console.log('Voici ton refresh token, à mettre dans SPOTIFY_REFRESH_TOKEN sur Vercel :\n');
      console.log(data.refresh_token);
      console.log('');
    } else {
      res.end('Quelque chose a échoué, regarde le terminal.');
      console.error('Réponse inattendue de Spotify :', data);
    }
  } catch (err) {
    res.end('Erreur, regarde le terminal.');
    console.error(err);
  }

  server.close();
});

server.listen(8888);
