// api/send-report.js
//
// Fonction serverless (Vercel, runtime Node.js). Reçoit le PDF généré côté
// navigateur en base64 et l'envoie par email en pièce jointe, via le compte
// Gmail du Chef Unité MIRE (SMTP + mot de passe d'application).
//
// Pourquoi ce backend plutôt qu'EmailJS :
// - EmailJS bloque les pièces jointes derrière un plan payant, quelle que
//   soit la taille du fichier.
// - Gmail SMTP est gratuit, sans limite de "plan", et autorise des pièces
//   jointes jusqu'à 25 Mo — très large pour un PDF vectoriel d'une page
//   (quelques dizaines de Ko).
//
// Sécurité : cette route est accessible publiquement une fois déployée (elle
// n'a pas de session utilisateur). La seule protection est la clé API
// partagée (X-Api-Key) — voir README.md pour la configuration.

const nodemailer = require('nodemailer');

// Limite de sécurité côté code. Vercel impose de toute façon un plafond dur de
// 4,5 Mo par requête (non contournable, même sur un plan payant) : au-delà,
// la requête est rejetée par l'infrastructure avant même d'atteindre ce code.
// On se fixe une marge de sécurité en dessous de ce plafond pour tenir compte
// du reste du JSON (destinataire, objet, message...).
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // 3 Mo (très large pour un PDF vectoriel d'une page, ~30-80 Ko)

function setCorsHeaders(res) {
  // Application interne à usage unique : on autorise toute origine plutôt que
  // de gérer une liste blanche de domaines. La clé API reste la vraie barrière.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
}

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Méthode non autorisée. Utilisez POST.' });
    return;
  }

  // ---------- Authentification par clé API partagée ----------
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

  // ---------- Validation de la charge utile ----------
  const { to_email, subject, message, reference, periode, pdf_base64, pdf_filename } = req.body || {};

  if (!isValidEmail(to_email)) {
    res.status(400).json({ ok: false, error: 'Adresse email destinataire invalide.' });
    return;
  }
  if (!pdf_base64 || typeof pdf_base64 !== 'string') {
    res.status(400).json({ ok: false, error: 'Pièce jointe PDF manquante.' });
    return;
  }
  if (!pdf_filename || typeof pdf_filename !== 'string') {
    res.status(400).json({ ok: false, error: 'Nom de fichier PDF manquant.' });
    return;
  }

  const attachmentBytes = Math.floor(pdf_base64.length * 0.75);
  if (attachmentBytes > MAX_ATTACHMENT_BYTES) {
    res.status(413).json({
      ok: false,
      error: `PDF trop volumineux (${Math.round(attachmentBytes / 1024)} Ko, limite ${MAX_ATTACHMENT_BYTES / 1024 / 1024} Mo).`,
    });
    return;
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error('GMAIL_USER ou GMAIL_APP_PASSWORD manquant dans les variables d\u2019environnement.');
    res.status(500).json({ ok: false, error: 'Configuration serveur incomplète (compte d\u2019envoi non configuré).' });
    return;
  }

  // ---------- Envoi ----------
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const bodyText = [
      message || 'MESSAGE',
      '',
      reference ? `Référence : ${reference}` : null,
      periode ? `Période : ${periode}` : null,
    ].filter(Boolean).join('\n');

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: to_email.trim(),
      subject: subject || 'OBJET',
      text: bodyText,
      attachments: [
        {
          filename: pdf_filename,
          content: Buffer.from(pdf_base64, 'base64'),
          contentType: 'application/pdf',
        },
      ],
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    // Le détail complet reste dans les logs serveur (Vercel > Deployments > Functions)
    // pour ne pas exposer d'information sensible (identifiants SMTP, etc.) au client.
    console.error('Échec de l\u2019envoi via Gmail SMTP :', e);
    res.status(502).json({ ok: false, error: 'Échec de l\u2019envoi côté serveur. Consultez les logs Vercel pour le détail.' });
  }
};
