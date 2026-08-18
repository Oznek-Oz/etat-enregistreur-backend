// api/get-signature.js
//
// Récupère l'image de signature depuis Google Drive côté serveur, et la
// renvoie en base64 au frontend. On passe par le backend plutôt que de
// charger l'image directement depuis Drive dans le navigateur (<img src=...>)
// car cette dernière approche empêcherait la lecture des pixels de l'image
// (restriction CORS du navigateur, "canvas tainted"), ce qui casserait
// silencieusement l'intégration de la signature dans le PDF généré côté
// client — l'image s'afficherait à l'écran mais disparaîtrait du PDF.
//
// Prérequis : le fichier doit être partagé sur Drive en "Tous les
// utilisateurs disposant du lien" (rôle Lecteur), sinon Google renvoie une
// page HTML de connexion au lieu du fichier.

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 Mo, largement suffisant pour une signature scannée

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Méthode non autorisée. Utilisez GET.' });
    return;
  }

  const providedKey = req.headers['x-api-key'];
  if (!process.env.BACKEND_API_KEY) {
    console.error('BACKEND_API_KEY manquante dans les variables d\u2019environnement.');
    res.status(500).json({ ok: false, error: 'Configuration serveur incomplète.' });
    return;
  }
  if (!providedKey || providedKey !== process.env.BACKEND_API_KEY) {
    res.status(401).json({ ok: false, error: 'Clé API invalide ou manquante.' });
    return;
  }

  if (!process.env.SIGNATURE_DRIVE_FILE_ID) {
    res.status(404).json({ ok: false, error: 'Aucun fichier de signature configuré (SIGNATURE_DRIVE_FILE_ID manquant).' });
    return;
  }

  const driveUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(process.env.SIGNATURE_DRIVE_FILE_ID)}`;

  try {
    const driveRes = await fetch(driveUrl, { redirect: 'follow' });

    if (!driveRes.ok) {
      throw new Error(`Google Drive a répondu ${driveRes.status}`);
    }

    const contentType = driveRes.headers.get('content-type') || '';
    if (contentType.startsWith('text/html')) {
      // Drive renvoie une page HTML (connexion, avertissement) au lieu du
      // fichier — signe quasi systématique que le partage n'est pas public.
      throw new Error('Le fichier ne semble pas partagé publiquement ("Tous les utilisateurs disposant du lien").');
    }

    const arrayBuffer = await driveRes.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`Fichier trop volumineux (${Math.round(arrayBuffer.byteLength / 1024)} Ko).`);
    }

    const base64 = Buffer.from(arrayBuffer).toString('base64');

    res.status(200).json({
      ok: true,
      content_type: contentType || 'image/png',
      image_base64: base64,
    });
  } catch (e) {
    console.error('Échec de récupération de la signature depuis Drive :', e);
    res.status(502).json({ ok: false, error: 'Échec de récupération de la signature : ' + e.message });
  }
};
