# Duo Intime 🔥

Jeu de questions/défis pour couple, en temps réel dans le navigateur (mobile-first).
Une personne crée une session (code + QR code), l'autre la rejoint. Vous répondez chacun de votre côté aux **mêmes** questions, et vos réponses s'affichent à vous deux dès que vous avez tous les deux validé.

## Fonctionnement

- **Sans compte, sans installation** : tout se passe dans le navigateur.
- Au début, on choisit si vous êtes **à la maison** ou **en dehors** (travail, extérieur) : les défis proposés s'adaptent pour rester toujours réalisables.
- Chaque partie tire **15 questions/défis au hasard** parmi une banque de plus de 130, avec **au moins 3 défis**, et une intensité qui monte progressivement (léger → complice → hot → très hot).
- Les deux partenaires répondent en privé, puis les réponses sont révélées aux deux en même temps.
- Le tirage étant aléatoire à chaque partie, vous pouvez rejouer autant de fois que vous voulez.

## Structure du projet

```
couple-quiz-app/
├── server.js          # Serveur Express + Socket.io (sessions, tirage, synchro)
├── questions.json      # Banque de questions et défis
├── package.json
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── README.md
```

## 1. Tester en local

```bash
npm install
npm start
```

Puis ouvrez `http://localhost:3000` dans deux onglets (ou deux téléphones sur le même réseau via l'IP locale de votre ordinateur).

## 2. Publier sur GitHub

```bash
cd couple-quiz-app
git init
git add .
git commit -m "Premier commit - Duo Intime"
git branch -M main
git remote add origin https://github.com/VOTRE-PSEUDO/duo-intime.git
git push -u origin main
```

> Créez d'abord un dépôt vide sur GitHub (bouton "New repository"), sans README ni .gitignore, puis copiez l'URL à utiliser dans `git remote add origin`.

## 3. Déployer gratuitement sur Render

1. Allez sur [render.com](https://render.com) et connectez-vous avec votre compte GitHub.
2. Cliquez sur **New +** → **Web Service**.
3. Sélectionnez le dépôt `duo-intime` que vous venez de pousser.
4. Configurez :
   - **Name** : `duo-intime` (ou ce que vous voulez, ça devient une partie de l'URL)
   - **Region** : la plus proche de vous
   - **Branch** : `main`
   - **Runtime** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : `Free`
5. Cliquez sur **Create Web Service**.

Render va construire et déployer automatiquement. Au bout de quelques minutes, vous obtenez une URL du type `https://duo-intime.onrender.com` — c'est cette URL que vous ouvrez sur vos téléphones pour jouer. Le QR code généré dans l'app pointera automatiquement vers cette même adresse.

⚠️ **À savoir sur le plan gratuit de Render** : le service "s'endort" après 15 minutes d'inactivité et met 30-60 secondes à se réveiller au prochain accès — normal, pas un bug. Les sessions de jeu sont stockées en mémoire : si le serveur redémarre (veille, redéploiement), les parties en cours sont perdues, mais on peut relancer une nouvelle session en 2 secondes.

## Personnaliser la banque de questions

Toutes les questions et défis sont dans `questions.json`. Chaque entrée :

```json
{ "id": "h005", "type": "question", "level": "hot", "location": "any", "text": "..." }
```

- `type` : `"question"` ou `"challenge"`
- `level` : `"light"`, `"medium"`, `"hot"`, `"very-hot"` (détermine l'ordre de la partie et la jauge de chaleur affichée)
- `location` : `"any"` (toujours proposé), `"home"` (uniquement si vous avez choisi "à la maison"), `"public-ok"` (adapté même en dehors de la maison)

Ajoutez autant de lignes que vous voulez, avec un `id` unique — elles rejoignent automatiquement le tirage aléatoire.
