# Backend d'envoi — État Enregistreur FKYS

Petite fonction serverless qui reçoit le PDF (généré côté navigateur) et
l'envoie par email en pièce jointe, via le compte Gmail du Chef Unité MIRE
(SMTP + mot de passe d'application). Gratuit, sans limite de "plan pièces
jointes", pas de nom de domaine requis.

Fichiers :
```
backend/
├── api/send-report.js   ← la fonction serverless (le vrai "backend")
├── package.json
├── .env.example          ← variables d'environnement à renseigner
└── README.md             ← ce fichier
```

## 1. Créer un mot de passe d'application Gmail

Le compte Gmail du Chef Unité MIRE doit avoir la **validation en deux étapes**
activée (obligatoire pour générer un mot de passe d'application).

1. Aller sur https://myaccount.google.com/security et activer la validation
   en deux étapes si ce n'est pas déjà fait.
2. Aller sur https://myaccount.google.com/apppasswords
3. Créer un mot de passe d'application (nom libre, ex. "Etat Enregistreur").
   Google génère une chaîne de 16 caractères type `abcd efgh ijkl mnop`.
4. Conserver cette valeur : c'est `GMAIL_APP_PASSWORD` (pas le mot de passe
   habituel du compte Gmail, qui ne fonctionnera pas en SMTP).

## 2. Déployer sur Vercel (gratuit, sans carte bancaire)

**Option A — en ligne de commande (recommandé) :**

```bash
cd backend
npm install -g vercel      # une seule fois
npm install                # installe nodemailer localement
vercel login                # ouvre le navigateur pour se connecter/créer un compte
vercel --prod                # déploie ; répondre aux questions par défaut suffit
```

Vercel affiche à la fin une URL du type `https://etat-enregistreur-backend-xxxx.vercel.app`.
Votre endpoint d'envoi sera : `https://etat-enregistreur-backend-xxxx.vercel.app/api/send-report`

**Option B — via GitHub :**
Poussez ce dossier `backend/` dans un dépôt GitHub, puis sur
https://vercel.com/new, importez ce dépôt. Vercel détecte automatiquement le
dossier `api/` et déploie la fonction.

## 3. Configurer les variables d'environnement sur Vercel

Sur https://vercel.com → votre projet → **Settings → Environment Variables**,
ajoutez (pour l'environnement "Production", et "Preview"/"Development" si
vous testez) :

| Nom | Valeur |
|---|---|
| `GMAIL_USER` | l'adresse Gmail complète du Chef Unité MIRE |
| `GMAIL_APP_PASSWORD` | le mot de passe d'application généré à l'étape 1 |
| `BACKEND_API_KEY` | une longue chaîne aléatoire secrète (ex: `openssl rand -hex 32`) |

Après avoir ajouté les variables, **redéployez** (`vercel --prod` à nouveau,
ou "Redeploy" dans le dashboard) pour qu'elles soient prises en compte.

## 4. Tester le backend indépendamment

```bash
curl -X POST https://VOTRE-URL.vercel.app/api/send-report \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: VOTRE_BACKEND_API_KEY" \
  -d '{
        "to_email": "destinataire@exemple.com",
        "subject": "Test",
        "message": "Ceci est un test.",
        "pdf_filename": "test.pdf",
        "pdf_base64": "JVBERi0xLjQKJcOkw7zDtsO..."
      }'
```
Une réponse `{"ok":true}` confirme que le backend fonctionne. Une erreur 401
signifie que `X-Api-Key` ne correspond pas à `BACKEND_API_KEY`. Une erreur 502
signifie un souci côté Gmail SMTP — consultez les logs dans Vercel
(**Deployments → [dernier déploiement] → Functions → send-report → Logs**)
pour le détail exact (identifiants invalides, etc.).

## 5. Configurer le frontend

Dans l'application (`etat_enregistreur_app.html`), section
**"Configuration technique"**, renseignez :
- **URL du backend** : `https://VOTRE-URL.vercel.app/api/send-report`
- **Clé API** : la même valeur que `BACKEND_API_KEY`

## Sécurité et limites à connaître

- La clé API est la **seule** protection de cette route (elle est
  publiquement accessible une fois déployée). Traitez-la comme un mot de
  passe : ne la partagez pas, ne la commitez pas dans un dépôt public.
- Vercel plafonne le corps de chaque requête à **4,5 Mo**, de façon fixe et
  non contournable — largement suffisant ici puisque le PDF vectoriel généré
  par l'application ne pèse que quelques dizaines de Ko.
- Un compte Gmail standard a une limite d'envoi quotidienne (de l'ordre de
  quelques centaines d'emails/jour) — sans rapport avec un usage
  hebdomadaire comme celui-ci.
- Le message d'erreur renvoyé au navigateur reste volontairement générique en
  cas d'échec (`502`) : le détail exact (identifiants SMTP invalides, etc.)
  n'est visible que dans les logs Vercel, pour ne pas exposer d'information
  sensible côté client.
