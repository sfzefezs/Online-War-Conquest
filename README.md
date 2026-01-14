# ⚔️ WAR TERRITORY - Conquête Stratégique Multijoueur Online

Un jeu de stratégie en temps réel où 4 équipes s'affrontent pour conquérir une carte gigantesque de 1500 territoires!

![War Territory](https://img.shields.io/badge/Version-2.0.0-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![Socket.io](https://img.shields.io/badge/Socket.io-4.7-purple)

## 🎮 Caractéristiques

- **Carte gigantesque** : 50 000 x 35 000 pixels avec 1 500 territoires
- **4 factions** : Empire Rouge, Alliance Bleue, Légion Verte, Ordre Doré
- **Multijoueur en ligne** : Jouez avec vos amis en temps réel
- **Système de rooms** : Créez ou rejoignez des parties avec un code
- **Chat en jeu** : Communiquez avec les autres joueurs
- **Minimap** : Vue stratégique de l'ensemble de la carte
- **Renforts automatiques** : Recevez des troupes basées sur vos territoires

## 📋 Prérequis

- [Node.js](https://nodejs.org/) version 18 ou supérieure
- npm (inclus avec Node.js)

## 🚀 Installation

### 1. Cloner ou télécharger le projet

```bash
cd "chemin/vers/le/dossier"
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Démarrer le serveur

```bash
npm start
```

Ou en mode développement avec rechargement automatique :

```bash
npm run dev
```

### 4. Ouvrir le jeu

Ouvrez votre navigateur et allez sur :

```
http://localhost:3000
```

## 🌐 Hébergement en ligne

### Option 1 : Render.com (Gratuit)

1. Créez un compte sur [render.com](https://render.com)
2. Connectez votre dépôt GitHub
3. Créez un nouveau "Web Service"
4. Configurez :
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Environment** : Node
5. Déployez !

### Option 2 : Railway.app (Gratuit)

1. Allez sur [railway.app](https://railway.app)
2. Connectez GitHub
3. Sélectionnez le projet
4. Railway détecte automatiquement Node.js
5. Déployez !

### Option 3 : Heroku

1. Installez [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
2. Exécutez :

```bash
heroku login
heroku create war-territory-game
git push heroku main
```

### Option 4 : VPS (DigitalOcean, AWS, etc.)

```bash
# Sur votre serveur
git clone <votre-repo>
cd war-territory
npm install
npm start
```

Utilisez PM2 pour maintenir le serveur actif :

```bash
npm install -g pm2
pm2 start server.js --name war-territory
pm2 save
pm2 startup
```

## 🎯 Comment jouer

### Créer une partie
1. Entrez votre nom de commandant
2. Laissez le code vide et cliquez "Rejoindre / Créer"
3. Partagez le code affiché avec vos amis

### Rejoindre une partie
1. Entrez votre nom de commandant
2. Entrez le code de la partie
3. Cliquez "Rejoindre / Créer"

### Gameplay
1. **Choisissez une faction** : Rouge, Bleu, Vert ou Jaune
2. **Renforcez** : Cliquez sur vos territoires et appuyez sur "Renforcer"
3. **Attaquez** : Sélectionnez un territoire ennemi voisin et attaquez
4. **Conquérez** : Dominez 80% de la carte pour gagner!

## 🗂️ Structure du projet

```
war-territory/
├── server.js              # Serveur Node.js + Socket.io
├── package.json           # Dépendances
├── README.md              # Ce fichier
└── public/                # Fichiers client
    ├── index.html         # Page principale
    ├── css/
    │   └── styles.css     # Styles CSS
    └── js/
        ├── config.js      # Configuration
        ├── map-generator.js # Générateur Voronoi
        ├── network.js     # Communication Socket.io
        ├── ui.js          # Interface utilisateur
        └── game.js        # Logique de jeu
```

## ⚙️ Configuration

Modifiez `public/js/config.js` pour ajuster :

- `MAP_WIDTH` / `MAP_HEIGHT` : Dimensions de la carte
- `TERRITORY_COUNT` : Nombre de territoires
- `CAPITAL_TROOPS` : Troupes de départ dans les capitales
- `REINFORCEMENT_AMOUNT` : Troupes par renforcement

## 🔧 Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `PORT` | Port du serveur | 3000 |

## 📡 API Socket.io

### Événements Client → Serveur

| Événement | Données | Description |
|-----------|---------|-------------|
| `join_room` | `{roomCode, playerName}` | Rejoindre une room |
| `select_team` | `team` | Choisir une équipe |
| `attack` | `{attackerId, targetId}` | Attaquer un territoire |
| `reinforce` | `{territoryId}` | Renforcer un territoire |
| `chat_message` | `message` | Envoyer un message |

### Événements Serveur → Client

| Événement | Données | Description |
|-----------|---------|-------------|
| `room_joined` | `{roomCode, mapSeed, territories, players}` | Room rejointe |
| `territories_update` | `territories[]` | Mise à jour des territoires |
| `battle_result` | `{success, message}` | Résultat d'une bataille |
| `game_over` | `{winner, message}` | Fin de partie |

## 🐛 Résolution de problèmes

### Le serveur ne démarre pas
- Vérifiez que Node.js 18+ est installé : `node --version`
- Vérifiez que le port 3000 n'est pas utilisé

### Impossible de se connecter
- Vérifiez que le serveur est démarré
- Vérifiez l'URL (localhost:3000 ou votre domaine)

### La carte ne charge pas
- Rafraîchissez la page
- Vérifiez la console du navigateur (F12)

## 📄 Licence

MIT License - Utilisez et modifiez librement !

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.

---

Créé avec ❤️ pour les amateurs de stratégie
