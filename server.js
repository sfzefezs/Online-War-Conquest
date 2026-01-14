const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"], credentials: true }
});

// Configuration CORS pour les API (permet l'accès depuis Hostinger)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Middleware pour parser le JSON
app.use(express.json());
app.use(express.static(__dirname + '/public'));

// ==================== ROUTES API AUTHENTIFICATION ====================

// Inscription
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
        }
        
        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: 'Nom d\'utilisateur doit faire entre 3 et 20 caractères' });
        }
        
        if (password.length < 4) {
            return res.status(400).json({ error: 'Mot de passe doit faire au moins 4 caractères' });
        }
        
        const user = await db.createUser(username, password, email);
        const token = crypto.randomBytes(32).toString('hex');
        await db.createSession(user.id, token);
        
        console.log(`📝 Nouvel utilisateur inscrit: ${username}`);
        
        res.json({ 
            success: true, 
            user: { id: user.id, username: user.username },
            token 
        });
    } catch (err) {
        console.error('Erreur inscription:', err);
        res.status(400).json({ error: err.message });
    }
});

// Connexion
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
        }
        
        const user = await db.authenticateUser(username, password);
        const token = crypto.randomBytes(32).toString('hex');
        await db.createSession(user.id, token);
        
        // Charger les données de jeu sauvegardées
        const gameData = await db.loadPlayerGameData(user.id);
        const stats = await db.getPlayerStats(user.id);
        
        console.log(`🔓 Connexion: ${username}`);
        
        res.json({ 
            success: true, 
            user: { id: user.id, username: user.username },
            token,
            savedData: gameData,
            stats
        });
    } catch (err) {
        console.error('Erreur connexion:', err);
        res.status(401).json({ error: err.message });
    }
});

// Déconnexion
app.post('/api/logout', async (req, res) => {
    try {
        const { token } = req.body;
        if (token) {
            const session = await db.validateSession(token);
            if (session) {
                await db.logoutUser(session.user_id);
                await db.deleteSession(token);
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Valider session
app.post('/api/validate-session', async (req, res) => {
    try {
        const { token } = req.body;
        const session = await db.validateSession(token);
        
        if (session) {
            const gameData = await db.loadPlayerGameData(session.user_id);
            const stats = await db.getPlayerStats(session.user_id);
            
            res.json({ 
                valid: true, 
                user: { id: session.user_id, username: session.username },
                savedData: gameData,
                stats
            });
        } else {
            res.json({ valid: false });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtenir les stats d'un joueur
app.get('/api/stats/:userId', async (req, res) => {
    try {
        const stats = await db.getPlayerStats(req.params.userId);
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Classement global
app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaderboard = await db.getGlobalLeaderboard(50);
        res.json(leaderboard);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

// ==================== CONFIGURATION ====================
const CONFIG = {
    MAP_WIDTH: 10000,
    MAP_HEIGHT: 7000,
    TERRITORY_COUNT: 500,
    
    // Ressources
    STARTING_GOLD: 1000,
    STARTING_FOOD: 400,
    GOLD_PER_TERRITORY: 2,
    FOOD_PER_TERRITORY: 1,
    RESOURCE_TICK: 5000, // 5 secondes
    
    // Coût nourriture par déplacement
    FOOD_PER_MOVE: 8, // Nourriture consommée par unité par case
    
    // Limite d'unités par joueur
    MAX_UNITS_PER_PLAYER: 20,
    
    // Unités - marchTime = temps en ms pour traverser 1 case
    UNITS: {
        infantry: {
            name: 'Infanterie',
            icon: '🚶',
            cost: { gold: 400, food: 150 },
            attack: 10,
            defense: 8,
            health: 100,
            buildTime: 30000, // 30 secondes
            marchTime: 120000 // 2 minutes par case
        },
        builder: {
            name: 'Constructeur',
            icon: '👷',
            cost: { gold: 750, food: 250 },
            attack: 2,
            defense: 5,
            health: 80,
            buildTime: 60000, // 1 minute
            marchTime: 150000, // 2m30 par case
            canBuild: true // Peut construire des bâtiments
        },
        scout: {
            name: 'Éclaireur',
            icon: '🏃',
            cost: { gold: 300, food: 126 },
            attack: 0, // Ne peut pas combattre
            defense: 3,
            health: 50,
            buildTime: 20000, // 20s
            marchTime: 30000, // 30s par case (très rapide)
            visionRange: 3, // Révèle 3 cases de brouillard
            noCombat: true // Ne participe pas aux combats
        },
        medic: {
            name: 'Médecin',
            icon: '🏥',
            cost: { gold: 600, food: 200 },
            attack: 0, // Ne combat pas
            defense: 5,
            health: 70,
            buildTime: 40000, // 40s
            marchTime: 120000, // 2 minutes par case
            healPerTurn: 15, // Soigne 15 HP par tour de combat
            noCombat: true
        },
        tank: {
            name: 'Tank',
            icon: '🚗',
            cost: { gold: 1250, food: 400 },
            attack: 30,
            defense: 25,
            health: 300,
            buildTime: 90000, // 1m30
            marchTime: 180000 // 3 minutes par case
        },
        lightVehicle: {
            name: 'Véhicule Léger',
            icon: '🚙',
            cost: { gold: 900, food: 300 },
            attack: 20,
            defense: 35,
            health: 180,
            buildTime: 60000, // 1 minute
            marchTime: 90000 // 1m30 par case
        },
        artillery: {
            name: 'Artillerie',
            icon: '💥',
            cost: { gold: 1750, food: 300 },
            attack: 5, // Dégâts au corps à corps (très faible)
            rangeAttack: 50, // Dégâts à distance (fort)
            range: 2, // Portée en cases
            reloadTime: 60000, // 60 secondes (1 minute) de rechargement
            defense: 5,
            health: 150,
            buildTime: 40000, // 40 secondes
            marchTime: 240000 // 4 minutes par case
        },
        helicopter: {
            name: 'Hélicoptère',
            icon: '🚁',
            cost: { gold: 2500, food: 400 },
            attack: 40,
            defense: 15,
            health: 200,
            buildTime: 90000, // 1m30
            marchTime: 60000 // 1 minute par case
        }
    },
    
    // Bâtiments constructibles par le Builder
    BUILDINGS: {
        barracks: {
            name: 'Caserne',
            icon: '🏠',
            cost: { gold: 1000, food: 0 },
            buildTime: 60000, // 1 minute
            canProduce: ['infantry', 'builder', 'scout', 'medic'], // Unités produisibles
            health: 500
        },
        factory: {
            name: 'Usine',
            icon: '🏭',
            cost: { gold: 1500, food: 0 },
            buildTime: 90000, // 1m30
            canProduce: ['tank', 'lightVehicle', 'artillery'],
            health: 600
        },
        helipad: {
            name: 'Héliport',
            icon: '🛫',
            cost: { gold: 2000, food: 0 },
            buildTime: 120000, // 2 minutes
            canProduce: ['helicopter'],
            health: 400
        },
        tower: {
            name: 'Tour de défense',
            icon: '🗼',
            cost: { gold: 800, food: 0 },
            buildTime: 45000, // 45s
            defense: 30,
            attack: 20,
            health: 300
        },
        farm: {
            name: 'Ferme',
            icon: '🌾',
            cost: { gold: 500, food: 0 },
            buildTime: 40000, // 40s
            health: 200,
            produces: { food: 8 } // +8 nourriture par tick
        },
        mine: {
            name: 'Mine d\'or',
            icon: '⛏️',
            cost: { gold: 700, food: 0 },
            buildTime: 50000, // 50s
            health: 250,
            produces: { gold: 15 } // +15 or par tick
        },
        hospital: {
            name: 'Hôpital',
            icon: '🏨',
            cost: { gold: 900, food: 0 },
            buildTime: 55000, // 55s
            health: 300,
            healPerTick: 10 // Soigne 10 HP par tick aux unités blessées
        }
    },
    
    // Météo
    WEATHER: {
        types: ['sunny', 'rainy', 'stormy', 'night'],
        duration: 60000, // 1 minute par cycle météo
        effects: {
            sunny: { speedMod: 1.0, visionMod: 1.0, name: '☀️ Ensoleillé' },
            rainy: { speedMod: 0.7, visionMod: 0.8, name: '🌧️ Pluie' },
            stormy: { speedMod: 0.5, visionMod: 0.6, name: '⛈️ Tempête' },
            night: { speedMod: 0.9, visionMod: 0.5, name: '🌙 Nuit' }
        }
    },
    
    // Types de terrain
    TERRAIN_TYPES: {
        plains: {
            name: 'Plaine',
            icon: '🌾',
            defenseMod: 1.0,
            attackMod: 1.0,
            speedMod: 1.0,
            ambushChance: 0,
            description: 'Terrain standard sans bonus particulier'
        },
        mountain: {
            name: 'Montagne',
            icon: '⛰️',
            defenseMod: 1.5,      // +50% défense
            attackMod: 0.8,       // -20% attaque (difficile d\'attaquer en montée)
            speedMod: 0.6,        // -40% vitesse de déplacement
            ambushChance: 0,
            goldBonus: 5,         // Bonus de ressources
            description: 'Excellente défense mais ralentit les troupes'
        },
        forest: {
            name: 'Forêt',
            icon: '🌲',
            defenseMod: 1.2,      // +20% défense
            attackMod: 1.0,
            speedMod: 0.8,        // -20% vitesse
            ambushChance: 0.25,   // 25% chance d\'embuscade
            foodBonus: 5,         // Bonus nourriture (chasse)
            description: 'Permet des embuscades et offre un couvert'
        },
        river: {
            name: 'Rivière',
            icon: '🌊',
            defenseMod: 1.3,      // +30% défense (difficile de traverser)
            attackMod: 0.7,       // -30% attaque (désavantage pour les attaquants)
            speedMod: 0.5,        // -50% vitesse
            ambushChance: 0,
            foodBonus: 3,         // Bonus pêche
            description: 'Ralentit fortement les attaquants'
        },
        desert: {
            name: 'Désert',
            icon: '🏜️',
            defenseMod: 0.9,      // -10% défense
            attackMod: 0.9,       // -10% attaque
            speedMod: 0.7,        // -30% vitesse
            ambushChance: 0,
            goldBonus: 8,         // Mines d\'or
            description: 'Conditions difficiles mais riche en or'
        },
        swamp: {
            name: 'Marécage',
            icon: '🐊',
            defenseMod: 1.1,
            attackMod: 0.8,
            speedMod: 0.4,        // Très lent
            ambushChance: 0.15,   // Embuscades possibles
            description: 'Terrain difficile, ralentit énormément'
        }
    },
    
    // Bâtiments
    BASE_HEALTH: 50,
    BASE_DEFENSE: 50,
    
    // Système Guerre/Paix
    WAR_PEACE: {
        cycleDuration: 5 * 60 * 60 * 1000, // 5 heures en millisecondes
        peaceSpeedMultiplier: 5.0, // Vitesse x5 pendant la paix
        warSpeedMultiplier: 1.0    // Vitesse normale pendant la guerre
    }
};

// ==================== SYSTÈME IA - NOMS ET STYLES ====================
const AI_NAMES = [
    "Général Wolf", "Commandant Storm", "Capitaine Blade", "Colonel Thunder",
    "Major Hawk", "Sergent Iron", "Lieutenant Shadow", "Amiral Frost",
    "Maréchal Fire", "Chef Steel", "Baron Dark", "Duke Viper",
    "Lord Titan", "Knight Raven", "Warlord Blaze", "Master Fury",
    "Admiral Stone", "General Phantom", "Commander Ace", "Captain Nova",
    "Colonel Rex", "Major Zeus", "Sergent Bolt", "Lieutenant Grim",
    "Amiral Shark", "Maréchal Drake", "Chef Odin", "Baron Kane",
    "Duke Reaper", "Lord Magnus", "Knight Storm", "Warlord Rage",
    "Master Venom", "Admiral Cyclone", "General Havoc", "Commander Axe",
    "Captain Fury", "Colonel Blitz", "Major Doom", "Sergent Hunter"
];

const AI_STYLES = {
    aggressive: {
        name: "Agressif",
        attackPriority: 0.9,      // Probabilité d'attaquer vs défendre
        expansionRate: 0.8,       // Priorité à l'expansion
        unitPreference: ['tank', 'cavalry', 'infantry', 'artillery'],
        buildingPreference: ['barracks', 'factory'],
        minUnitsToAttack: 3,
        resourceThreshold: 0.3    // Dépense quand a 30%+ des ressources max
    },
    defensive: {
        name: "Défensif",
        attackPriority: 0.3,
        expansionRate: 0.3,
        unitPreference: ['archer', 'infantry', 'medic', 'builder'],
        buildingPreference: ['tower', 'hospital', 'farm'],
        minUnitsToAttack: 8,
        resourceThreshold: 0.6
    },
    economic: {
        name: "Économique",
        attackPriority: 0.4,
        expansionRate: 0.5,
        unitPreference: ['builder', 'scout', 'infantry', 'lightVehicle'],
        buildingPreference: ['mine', 'farm', 'factory'],
        minUnitsToAttack: 6,
        resourceThreshold: 0.7
    },
    balanced: {
        name: "Équilibré",
        attackPriority: 0.5,
        expansionRate: 0.5,
        unitPreference: ['infantry', 'cavalry', 'archer', 'medic'],
        buildingPreference: ['barracks', 'farm', 'tower'],
        minUnitsToAttack: 5,
        resourceThreshold: 0.5
    },
    rusher: {
        name: "Rusher",
        attackPriority: 0.95,
        expansionRate: 0.9,
        unitPreference: ['cavalry', 'scout', 'lightVehicle', 'infantry'],
        buildingPreference: ['barracks', 'helipad'],
        minUnitsToAttack: 2,
        resourceThreshold: 0.2
    },
    turtler: {
        name: "Turtle",
        attackPriority: 0.15,
        expansionRate: 0.2,
        unitPreference: ['archer', 'artillery', 'medic', 'infantry'],
        buildingPreference: ['tower', 'hospital', 'mine', 'farm'],
        minUnitsToAttack: 12,
        resourceThreshold: 0.8
    },
    tech: {
        name: "Technicien",
        attackPriority: 0.4,
        expansionRate: 0.4,
        unitPreference: ['tank', 'artillery', 'helicopter', 'builder'],
        buildingPreference: ['factory', 'helipad', 'mine'],
        minUnitsToAttack: 4,
        resourceThreshold: 0.5
    },
    swarm: {
        name: "Essaim",
        attackPriority: 0.7,
        expansionRate: 0.7,
        unitPreference: ['infantry', 'infantry', 'scout', 'archer'],
        buildingPreference: ['barracks', 'barracks', 'farm'],
        minUnitsToAttack: 8,
        resourceThreshold: 0.3
    },
    opportunist: {
        name: "Opportuniste",
        attackPriority: 0.6,
        expansionRate: 0.6,
        unitPreference: ['cavalry', 'scout', 'infantry', 'tank'],
        buildingPreference: ['barracks', 'factory', 'mine'],
        minUnitsToAttack: 4,
        resourceThreshold: 0.4
    },
    sniper: {
        name: "Sniper",
        attackPriority: 0.5,
        expansionRate: 0.4,
        unitPreference: ['archer', 'artillery', 'scout', 'infantry'],
        buildingPreference: ['tower', 'barracks', 'mine'],
        minUnitsToAttack: 5,
        resourceThreshold: 0.5
    }
};

const AI_STYLE_NAMES = Object.keys(AI_STYLES);

// ==================== ÉTAT DU JEU GLOBAL ====================
let gameState = {
    territories: [],
    players: new Map(),
    aiPlayers: new Map(), // Map des joueurs IA
    teams: {
        red: { players: [], territories: 0 },
        blue: { players: [], territories: 0 },
        green: { players: [], territories: 0 },
        yellow: { players: [], territories: 0 }
    },
    movingUnits: [], // Unités en déplacement
    mapSeed: null,
    lastSave: null,
    weather: {
        current: 'sunny',
        nextChange: Date.now() + 60000
    },
    // Système Guerre/Paix
    warPeace: {
        isWar: true, // Commence en guerre
        nextChange: Date.now() + CONFIG.WAR_PEACE.cycleDuration,
        cycleStartTime: Date.now()
    }
};

// Note: Les sauvegardes sont maintenant dans la base de données SQLite

// ==================== FONCTION HELPER POUR LES DONNÉES D'ÉQUIPES ====================
function getTeamsData() {
    // Helper pour récupérer les données d'un joueur depuis son socket.id
    const getPlayerData = (socketId) => {
        const player = gameState.players.get(socketId);
        if (!player) return null;
        return {
            oderId: player.oderId,
            name: player.name,
            hasBase: player.hasBase,
            resources: player.resources,
            isAI: player.isAI || false,
            aiStyle: player.style || null
        };
    };
    
    return {
        red: { 
            playerCount: gameState.teams.red.players.length, 
            territories: gameState.teams.red.territories,
            players: gameState.teams.red.players.map(getPlayerData).filter(p => p !== null)
        },
        blue: { 
            playerCount: gameState.teams.blue.players.length, 
            territories: gameState.teams.blue.territories,
            players: gameState.teams.blue.players.map(getPlayerData).filter(p => p !== null)
        },
        green: { 
            playerCount: gameState.teams.green.players.length, 
            territories: gameState.teams.green.territories,
            players: gameState.teams.green.players.map(getPlayerData).filter(p => p !== null)
        },
        yellow: { 
            playerCount: gameState.teams.yellow.players.length, 
            territories: gameState.teams.yellow.territories,
            players: gameState.teams.yellow.players.map(getPlayerData).filter(p => p !== null)
        }
    };
}

// ==================== NOMS DE TERRITOIRES ====================
const territoryNames = [
    "Nordheim", "Sudland", "Estmark", "Westria", "Centralia",
    "Montclair", "Valroche", "Côte d'Or", "Boisfort", "Plaine Verte",
    "Rochenoire", "Lac Bleu", "Col du Vent", "Désert Rouge", "Île Perdue",
    "Haute-Tour", "Bas-Fond", "Terre Brûlée", "Neigeville", "Solaria",
    "Ombreval", "Lumièria", "Fermont", "Portval", "Crêtedor",
    "Sylvanie", "Aquatia", "Ignisia", "Terranova", "Aéris",
    "Kronstadt", "Volkhaven", "Stormdale", "Frostheim", "Sunridge",
    "Darkwood", "Clearwater", "Ironforge", "Goldfield", "Silvermine",
    "Royaume Nord", "Empire Sud", "Duché Est", "Comté Ouest", "Baronnie",
    "Archipel", "Péninsule", "Delta", "Fjord", "Toundra",
    "Avalon", "Eldoria", "Mystara", "Valinor", "Gondolin",
    "Rivendell", "Mordheim", "Altdorf", "Marienburg", "Nuln"
];

// ==================== GÉNÉRATION DE MAP ====================
// Générateur de nombres pseudo-aléatoires avec état
class SeededRNG {
    constructor(seed) {
        this.seed = seed;
    }
    
    next() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
}

function generateTerritories(seed) {
    const territories = [];
    const rng = new SeededRNG(seed);
    
    // Calculer une grille pour mieux répartir les territoires
    const cols = Math.ceil(Math.sqrt(CONFIG.TERRITORY_COUNT * CONFIG.MAP_WIDTH / CONFIG.MAP_HEIGHT));
    const rows = Math.ceil(CONFIG.TERRITORY_COUNT / cols);
    const cellWidth = CONFIG.MAP_WIDTH / cols;
    const cellHeight = CONFIG.MAP_HEIGHT / rows;
    
    for (let i = 0; i < CONFIG.TERRITORY_COUNT; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        
        // Position de base dans la grille + variation aléatoire
        const baseX = col * cellWidth + cellWidth / 2;
        const baseY = row * cellHeight + cellHeight / 2;
        
        // Ajouter une variation aléatoire (jusqu'à 30% de la cellule)
        const offsetX = (rng.next() - 0.5) * cellWidth * 0.6;
        const offsetY = (rng.next() - 0.5) * cellHeight * 0.6;
        
        // Déterminer le type de terrain aléatoirement
        const terrainRoll = rng.next();
        let terrainType = 'plains';
        if (terrainRoll < 0.15) terrainType = 'mountain';
        else if (terrainRoll < 0.35) terrainType = 'forest';
        else if (terrainRoll < 0.45) terrainType = 'river';
        else if (terrainRoll < 0.52) terrainType = 'desert';
        else if (terrainRoll < 0.57) terrainType = 'swamp';
        // sinon plains (43%)
        
        const terrain = CONFIG.TERRAIN_TYPES[terrainType];
        
        // Calculer les ressources de base + bonus du terrain
        let baseGold = Math.floor(rng.next() * 20) + 5;
        let baseFood = Math.floor(rng.next() * 15) + 3;
        
        if (terrain.goldBonus) baseGold += terrain.goldBonus;
        if (terrain.foodBonus) baseFood += terrain.foodBonus;
        
        territories.push({
            id: i,
            name: territoryNames[i % territoryNames.length] + (i >= territoryNames.length ? ` ${Math.floor(i / territoryNames.length) + 1}` : ''),
            centerX: Math.max(300, Math.min(CONFIG.MAP_WIDTH - 300, baseX + offsetX)),
            centerY: Math.max(300, Math.min(CONFIG.MAP_HEIGHT - 300, baseY + offsetY)),
            owner: null,
            team: null,
            units: [],
            base: null,
            buildings: [],
            terrain: terrainType, // Type de terrain
            resources: {
                gold: baseGold,
                food: baseFood
            },
            // Bonus spéciaux pour certains territoires
            bonusResource: rng.next() > 0.85 ? (rng.next() > 0.5 ? 'gold' : 'food') : null,
            bonusAmount: Math.floor(rng.next() * 10) + 5
        });
    }
    
    // Calculer les voisins (distance basée sur la taille des cellules)
    const neighborDist = Math.max(cellWidth, cellHeight) * 1.5;
    for (let i = 0; i < territories.length; i++) {
        territories[i].neighbors = [];
        for (let j = 0; j < territories.length; j++) {
            if (i === j) continue;
            const dist = Math.sqrt(
                (territories[i].centerX - territories[j].centerX) ** 2 +
                (territories[i].centerY - territories[j].centerY) ** 2
            );
            if (dist < neighborDist) {
                territories[i].neighbors.push(j);
            }
        }
    }
    
    return territories;
}

function logTerritoryPositions(territories) {
    console.log('📍 Exemples de positions de territoires:');
    for (let i = 0; i < Math.min(5, territories.length); i++) {
        console.log(`   ${territories[i].name}: (${Math.round(territories[i].centerX)}, ${Math.round(territories[i].centerY)})`);
    }
    console.log(`   ... et ${territories.length - 5} autres territoires`);
    console.log(`   Map: ${CONFIG.MAP_WIDTH}x${CONFIG.MAP_HEIGHT}`);
}

// ==================== NOTIFICATIONS GLOBALES ====================
function broadcastGlobalEvent(eventType, data) {
    const message = {
        type: eventType,
        ...data,
        timestamp: Date.now()
    };
    io.emit('global_event', message);
}

// Envoyer un événement uniquement aux joueurs concernés (équipe + spectateurs)
function emitToTeam(team, eventName, data) {
    // Trouver tous les sockets des joueurs de cette équipe
    gameState.players.forEach((player, socketId) => {
        if (player.team === team || player.isSpectator) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
                socket.emit(eventName, data);
            }
        }
    });
}

// Envoyer un événement uniquement à l'attaquant (et spectateurs)
// Les défenseurs ne voient plus le combat
function emitToBattleParticipants(attackerOwnerId, defenderTeam, eventName, data) {
    // Trouver le socket de l'attaquant par son oderId
    let attackerSocket = null;
    gameState.players.forEach((player, socketId) => {
        if (player.oderId === attackerOwnerId && !player.isSpectator) {
            attackerSocket = io.sockets.sockets.get(socketId);
        }
    });
    
    if (attackerSocket) {
        attackerSocket.emit(eventName, data);
    }
    
    // Envoyer aux spectateurs uniquement
    gameState.players.forEach((player, socketId) => {
        if (player.isSpectator) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
                socket.emit(eventName, data);
            }
        }
    });
}

// Envoyer uniquement au propriétaire du mouvement
function emitToOwner(ownerId, eventName, data) {
    // Trouver le socket du propriétaire par son oderId
    let ownerSocket = null;
    gameState.players.forEach((player, socketId) => {
        if (player.oderId === ownerId && !player.isSpectator) {
            ownerSocket = io.sockets.sockets.get(socketId);
        }
    });
    
    if (ownerSocket) {
        ownerSocket.emit(eventName, data);
    }
    // Aussi aux spectateurs
    gameState.players.forEach((player, socketId) => {
        if (player.isSpectator) {
            const specSocket = io.sockets.sockets.get(socketId);
            if (specSocket) {
                specSocket.emit(eventName, { ...data, isSpectatorView: true });
            }
        }
    });
}

// ==================== SAUVEGARDE / CHARGEMENT (DATABASE) ====================
async function saveGame() {
    try {
        // Sauvegarder l'état global
        await db.saveGameState({
            mapSeed: gameState.mapSeed,
            warPeriod: gameState.warPeace.isWarPeriod,
            cycleStartTime: gameState.warPeace.cycleStartTime,
            nextChange: gameState.warPeace.nextChange
        });
        
        // Sauvegarder les territoires
        await db.saveAllTerritories(gameState.territories.map(t => ({
            id: t.id,
            owner: t.owner,
            team: t.team,
            units: t.units,
            base: t.base
        })));
        
        // Sauvegarder les équipes
        await db.saveTeams({
            red: { territories: gameState.teams.red.territories, totalKills: gameState.teams.red.totalKills || 0 },
            blue: { territories: gameState.teams.blue.territories, totalKills: gameState.teams.blue.totalKills || 0 },
            green: { territories: gameState.teams.green.territories, totalKills: gameState.teams.green.totalKills || 0 },
            yellow: { territories: gameState.teams.yellow.territories, totalKills: gameState.teams.yellow.totalKills || 0 }
        });
        
        gameState.lastSave = Date.now();
        console.log('💾 Partie sauvegardée dans la base de données');
    } catch (err) {
        console.error('❌ Erreur sauvegarde DB:', err);
    }
}

async function loadGame() {
    try {
        // Charger l'état global
        const savedState = await db.loadGameState();
        
        if (savedState) {
            gameState.mapSeed = savedState.mapSeed;
            gameState.territories = generateTerritories(savedState.mapSeed);
            gameState.warPeace.isWarPeriod = savedState.warPeriod;
            gameState.warPeace.cycleStartTime = savedState.cycleStartTime;
            gameState.warPeace.nextChange = savedState.nextChange;
            
            // Charger les territoires
            const savedTerritories = await db.loadAllTerritories();
            
            savedTerritories.forEach(saved => {
                const territory = gameState.territories[saved.id];
                if (territory) {
                    territory.owner = saved.owner;
                    territory.team = saved.team;
                    territory.units = saved.units || [];
                    if (saved.base) {
                        territory.base = {
                            ...saved.base,
                            health: CONFIG.BASE_HEALTH,
                            maxHealth: CONFIG.BASE_HEALTH
                        };
                    } else {
                        territory.base = saved.base;
                    }
                }
            });
            
            // Charger les équipes
            const savedTeams = await db.loadTeams();
            Object.keys(savedTeams).forEach(team => {
                if (gameState.teams[team]) {
                    gameState.teams[team].territories = savedTeams[team].territories || 0;
                    gameState.teams[team].totalKills = savedTeams[team].totalKills || 0;
                }
            });
            
            console.log('📂 Partie chargée depuis la base de données');
            return true;
        }
    } catch (err) {
        console.error('❌ Erreur chargement DB:', err);
    }
    return false;
}

function initNewGame() {
    gameState.mapSeed = Math.floor(Math.random() * 1000000);
    gameState.territories = generateTerritories(gameState.mapSeed);
    
    // Attribuer un territoire de départ à chaque équipe (aux 4 coins de la carte)
    const teams = ['red', 'blue', 'green', 'yellow'];
    const corners = [
        { x: CONFIG.MAP_WIDTH * 0.15, y: CONFIG.MAP_HEIGHT * 0.15 },  // Haut-gauche - Rouge
        { x: CONFIG.MAP_WIDTH * 0.85, y: CONFIG.MAP_HEIGHT * 0.15 },  // Haut-droite - Bleu
        { x: CONFIG.MAP_WIDTH * 0.15, y: CONFIG.MAP_HEIGHT * 0.85 },  // Bas-gauche - Vert
        { x: CONFIG.MAP_WIDTH * 0.85, y: CONFIG.MAP_HEIGHT * 0.85 }   // Bas-droite - Jaune
    ];
    
    teams.forEach((team, idx) => {
        // Trouver le territoire le plus proche du coin
        let closestTerritory = null;
        let minDist = Infinity;
        
        gameState.territories.forEach(t => {
            if (t.team) return; // Déjà attribué
            const dist = Math.sqrt(
                (t.centerX - corners[idx].x) ** 2 + 
                (t.centerY - corners[idx].y) ** 2
            );
            if (dist < minDist) {
                minDist = dist;
                closestTerritory = t;
            }
        });
        
        if (closestTerritory) {
            closestTerritory.team = team;
            closestTerritory.owner = 'team_' + team;
            gameState.teams[team].territories = 1;
            console.log(`🏴 Territoire de départ ${team}: ${closestTerritory.name}`);
        }
    });
    
    logTerritoryPositions(gameState.territories);
    console.log('🆕 Nouvelle partie créée avec seed:', gameState.mapSeed);
}

// ==================== SYSTÈME DE JOUEURS IA ====================
const AI_PLAYERS_PER_TEAM = 10;
let aiNameIndex = 0;
let aiUpdateInterval = null;

// Créer un joueur IA
function createAIPlayer(team, style) {
    const aiId = `ai_${team}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const name = AI_NAMES[aiNameIndex % AI_NAMES.length] + " (IA)";
    aiNameIndex++;
    
    const aiPlayer = {
        oderId: aiId,
        name: name,
        team: team,
        isAI: true,
        style: style,
        styleConfig: AI_STYLES[style],
        resources: {
            gold: CONFIG.STARTING_GOLD,
            food: CONFIG.STARTING_FOOD
        },
        hasBase: false,
        baseTerritory: null,
        productionQueue: [],
        units: [],
        kills: 0,
        technologies: {
            improvedAttack: false,
            improvedDefense: false,
            improvedSpeed: false,
            improvedVision: false,
            improvedHeal: false
        },
        lastAction: Date.now(),
        actionCooldown: 2000 + Math.random() * 3000 // 2-5 secondes entre actions
    };
    
    // Ajouter à l'état du jeu
    gameState.players.set(aiId, aiPlayer);
    gameState.aiPlayers.set(aiId, aiPlayer);
    gameState.teams[team].players.push(aiId);
    
    return aiPlayer;
}

// Créer tous les joueurs IA au démarrage
function initializeAIPlayers() {
    console.log('🤖 Initialisation des joueurs IA...');
    
    const teams = ['red', 'blue', 'green', 'yellow'];
    const styles = AI_STYLE_NAMES;
    
    teams.forEach(team => {
        for (let i = 0; i < AI_PLAYERS_PER_TEAM; i++) {
            // Attribuer un style varié
            const style = styles[i % styles.length];
            const ai = createAIPlayer(team, style);
            console.log(`  🤖 ${ai.name} (${team}) - Style: ${AI_STYLES[style].name}`);
        }
    });
    
    console.log(`✅ ${AI_PLAYERS_PER_TEAM * 4} joueurs IA créés (${AI_PLAYERS_PER_TEAM} par équipe)`);
    
    // Placer les bases des IA après un délai
    setTimeout(() => {
        placeAIBases();
    }, 3000);
}

// Placer les bases de tous les joueurs IA
function placeAIBases() {
    console.log('🏰 Placement des bases IA...');
    
    gameState.aiPlayers.forEach((ai, aiId) => {
        if (!ai.hasBase) {
            placeAIBase(ai);
        }
    });
}

// Placer la base d'un joueur IA
function placeAIBase(ai) {
    // Trouver un territoire de l'équipe sans base
    const availableTerritories = gameState.territories.filter(t => 
        t.team === ai.team && !t.base
    );
    
    if (availableTerritories.length === 0) {
        // Pas de territoire disponible, essayer de conquérir un territoire neutre adjacent
        const teamTerritories = gameState.territories.filter(t => t.team === ai.team);
        
        for (const territory of teamTerritories) {
            const neutralNeighbor = territory.neighbors.find(nId => {
                const neighbor = gameState.territories[nId];
                return neighbor && !neighbor.team && !neighbor.base;
            });
            
            if (neutralNeighbor !== undefined) {
                const neighbor = gameState.territories[neutralNeighbor];
                // Conquérir le territoire neutre pour l'équipe
                neighbor.team = ai.team;
                neighbor.owner = ai.oderId;
                gameState.teams[ai.team].territories++;
                
                // Placer la base sur ce nouveau territoire
                neighbor.base = {
                    ownerId: ai.oderId,
                    playerId: ai.oderId,
                    socketId: ai.oderId,
                    team: ai.team,
                    health: CONFIG.BASE_HEALTH,
                    maxHealth: CONFIG.BASE_HEALTH
                };
                
                ai.hasBase = true;
                ai.baseTerritory = neighbor.id;
                
                io.emit('territory_update', {
                    id: neighbor.id,
                    owner: neighbor.owner,
                    team: neighbor.team,
                    base: neighbor.base,
                    units: neighbor.units || [],
                    buildings: neighbor.buildings || []
                });
                
                console.log(`  🏰 ${ai.name} a conquis et placé sa base sur ${neighbor.name}`);
                return true;
            }
        }
        
        return false;
    }
    
    // Choisir un territoire selon le style
    let chosenTerritory;
    
    if (ai.styleConfig.attackPriority > 0.6) {
        // Style agressif: choisir près des frontières
        chosenTerritory = availableTerritories.reduce((best, t) => {
            const hasEnemyNeighbor = t.neighbors.some(nId => {
                const neighbor = gameState.territories[nId];
                return neighbor && neighbor.team && neighbor.team !== ai.team;
            });
            if (hasEnemyNeighbor && (!best || Math.random() > 0.5)) return t;
            return best || t;
        }, null);
    } else if (ai.styleConfig.attackPriority < 0.4) {
        // Style défensif: choisir au centre du territoire allié
        chosenTerritory = availableTerritories.reduce((best, t) => {
            const alliedNeighbors = t.neighbors.filter(nId => {
                const neighbor = gameState.territories[nId];
                return neighbor && neighbor.team === ai.team;
            }).length;
            if (!best || alliedNeighbors > best.alliedCount) {
                return { ...t, alliedCount: alliedNeighbors };
            }
            return best;
        }, null);
    } else {
        // Style équilibré: choisir aléatoirement
        chosenTerritory = availableTerritories[Math.floor(Math.random() * availableTerritories.length)];
    }
    
    if (chosenTerritory) {
        // Placer la base
        chosenTerritory.base = {
            ownerId: ai.oderId,
            playerId: ai.oderId,
            socketId: ai.oderId,
            team: ai.team,
            health: CONFIG.BASE_HEALTH,
            maxHealth: CONFIG.BASE_HEALTH
        };
        
        ai.hasBase = true;
        ai.baseTerritory = chosenTerritory.id;
        
        // Émettre la mise à jour
        io.emit('territory_update', {
            id: chosenTerritory.id,
            owner: chosenTerritory.owner,
            team: chosenTerritory.team,
            base: chosenTerritory.base,
            units: chosenTerritory.units,
            buildings: chosenTerritory.buildings || []
        });
        
        console.log(`  🏰 ${ai.name} a placé sa base sur ${chosenTerritory.name}`);
        return true;
    }
    
    return false;
}

// ==================== AUTO-ÉQUILIBRAGE ====================
function getTeamWithLeastPlayers() {
    const teams = ['red', 'blue', 'green', 'yellow'];
    let minTeam = teams[0];
    let minCount = gameState.teams[teams[0]].players.length;
    
    teams.forEach(team => {
        if (gameState.teams[team].players.length < minCount) {
            minCount = gameState.teams[team].players.length;
            minTeam = team;
        }
    });
    
    return minTeam;
}

// ==================== COMPTAGE DES UNITÉS ====================
function countPlayerUnits(playerId) {
    let count = 0;
    for (const territory of gameState.territories) {
        if (territory.units) {
            count += territory.units.filter(u => u.ownerId === playerId).length;
        }
    }
    // Ajouter les unités en mouvement
    if (gameState.movingUnits) {
        count += gameState.movingUnits.filter(m => m.ownerId === playerId).length;
    }
    return count;
}

// Compter les unités d'un type spécifique pour un joueur
function countPlayerUnitsByType(playerId, unitType) {
    let count = 0;
    for (const territory of gameState.territories) {
        if (territory.units) {
            count += territory.units.filter(u => u.ownerId === playerId && u.type === unitType).length;
        }
    }
    if (gameState.movingUnits) {
        count += gameState.movingUnits.filter(m => m.ownerId === playerId && m.type === unitType).length;
    }
    return count;
}

// ==================== GESTION DES RESSOURCES ====================
function updatePlayerResources(player) {
    // Territoires dont le joueur est propriétaire (gouverneur) - 100% des ressources
    const ownedTerritories = gameState.territories.filter(t => t.owner === player.oderId);
    
    // Territoires de l'équipe mais dont le joueur n'est pas propriétaire - 50% des ressources
    const teamTerritories = gameState.territories.filter(t => 
        t.team === player.team && t.owner && t.owner !== player.oderId
    );
    
    // Les IA gagnent 50% moins de ressources que les humains
    const aiMultiplier = player.isAI ? 0.5 : 1.0;
    
    // Revenus des territoires possédés (100%)
    ownedTerritories.forEach(t => {
        const multiplier = aiMultiplier * 1.0; // 100% pour le gouverneur
        player.resources.gold += Math.floor(t.resources.gold * multiplier);
        player.resources.food += Math.floor(t.resources.food * multiplier);
        
        // Bonus spécial du territoire
        if (t.bonusResource) {
            player.resources[t.bonusResource] += Math.floor(t.bonusAmount * multiplier);
        }
        
        // Production des bâtiments (100% pour le propriétaire du bâtiment)
        if (t.buildings) {
            t.buildings.forEach(building => {
                if (building.ownerId === player.oderId) {
                    const config = CONFIG.BUILDINGS[building.type];
                    if (config && config.produces) {
                        if (config.produces.gold) player.resources.gold += Math.floor(config.produces.gold * aiMultiplier);
                        if (config.produces.food) player.resources.food += Math.floor(config.produces.food * aiMultiplier);
                    }
                }
            });
        }
    });
    
    // Revenus des territoires de l'équipe (50% pour les coéquipiers)
    teamTerritories.forEach(t => {
        const multiplier = aiMultiplier * 0.5; // 50% pour les coéquipiers
        player.resources.gold += Math.floor(t.resources.gold * multiplier);
        player.resources.food += Math.floor(t.resources.food * multiplier);
        
        // Bonus partagé aussi à 50%
        if (t.bonusResource) {
            player.resources[t.bonusResource] += Math.floor(t.bonusAmount * multiplier);
        }
    });
    
    if (player.hasBase) {
        player.resources.gold += Math.floor(20 * aiMultiplier);
        player.resources.food += Math.floor(10 * aiMultiplier);
    }
}

// Soigner les unités dans les territoires avec hôpital
function healUnitsInHospitals() {
    gameState.territories.forEach(territory => {
        if (!territory.buildings) return;
        
        // Trouver les hôpitaux sur ce territoire
        const hospitals = territory.buildings.filter(b => b.type === 'hospital');
        if (hospitals.length === 0) return;
        
        // Calculer le soin total
        const totalHeal = hospitals.length * CONFIG.BUILDINGS.hospital.healPerTick;
        
        // Soigner les unités alliées blessées
        territory.units.forEach(unit => {
            // Vérifier si l'unité appartient au propriétaire de l'hôpital
            const hospitalOwner = hospitals[0].ownerId;
            const unitOwnerPlayer = Array.from(gameState.players.values()).find(p => p.oderId === unit.ownerId);
            const hospitalOwnerPlayer = Array.from(gameState.players.values()).find(p => p.oderId === hospitalOwner);
            
            if (unitOwnerPlayer && hospitalOwnerPlayer && unitOwnerPlayer.team === hospitalOwnerPlayer.team) {
                const maxHealth = CONFIG.UNITS[unit.type]?.health || 100;
                if (unit.health < maxHealth) {
                    unit.health = Math.min(maxHealth, unit.health + totalHeal);
                }
            }
        });
    });
}

// ==================== CALCUL DU TEMPS DE DÉPLACEMENT AVEC TERRAIN ====================
function calculateMoveTime(territoryId, baseTimePerTerritory) {
    const territory = gameState.territories[territoryId];
    const terrainType = territory?.terrain || 'plains';
    const terrain = CONFIG.TERRAIN_TYPES[terrainType] || CONFIG.TERRAIN_TYPES.plains;
    
    // Appliquer le modificateur de vitesse du terrain
    // speedMod < 1 = plus lent, donc on divise le temps par speedMod (plus grand temps)
    return Math.round(baseTimePerTerritory / terrain.speedMod);
}

// ==================== COMBAT ====================

// Fonction pour incrémenter les kills d'un joueur
function addKillsToPlayer(playerId, killCount) {
    if (!playerId || killCount <= 0) return;
    
    // Chercher le joueur dans gameState.players
    gameState.players.forEach((player, socketId) => {
        if (player.oderId === playerId || socketId === playerId) {
            player.kills = (player.kills || 0) + killCount;
        }
    });
}

function calculateBattleResult(attackingUnits, defendingUnits, defenderBase) {
    let attackPower = 0;
    let defensePower = 0;
    
    attackingUnits.forEach(unit => {
        attackPower += CONFIG.UNITS[unit.type].attack * (unit.health / CONFIG.UNITS[unit.type].health);
    });
    
    defendingUnits.forEach(unit => {
        defensePower += CONFIG.UNITS[unit.type].defense * (unit.health / CONFIG.UNITS[unit.type].health);
    });
    
    if (defenderBase) {
        defensePower += CONFIG.BASE_DEFENSE * (defenderBase.health / CONFIG.BASE_HEALTH);
    }
    
    attackPower *= (0.8 + Math.random() * 0.4);
    defensePower *= (0.8 + Math.random() * 0.4);
    
    return {
        attackerWins: attackPower > defensePower,
        attackPower,
        defensePower,
        ratio: attackPower / (defensePower || 1)
    };
}

// Combat détaillé avec rounds pour animation - prend en compte le terrain
function calculateDetailedBattle(attackingUnits, defendingUnits, defenderBase, terrainType = 'plains') {
    const terrain = CONFIG.TERRAIN_TYPES[terrainType] || CONFIG.TERRAIN_TYPES.plains;
    const rounds = [];
    
    // DEBUG: Vérifier les ownerIds des unités entrantes
    console.log('🔍 DEBUG BATTLE - attackingUnits ownerIds:', attackingUnits.map(u => u.ownerId));
    console.log('🔍 DEBUG BATTLE - defendingUnits ownerIds:', defendingUnits.map(u => u.ownerId));
    
    // Vérifier si embuscade (forêt, marécage)
    const ambushTriggered = terrain.ambushChance > 0 && Math.random() < terrain.ambushChance;
    
    const attackers = attackingUnits.map((u, idx) => ({
        ...u,
        originalIdx: idx,
        currentHealth: u.health,
        maxHealth: CONFIG.UNITS[u.type].health
    }));
    const defenders = defendingUnits.map((u, idx) => ({
        ...u,
        originalIdx: idx,
        currentHealth: u.health,
        maxHealth: CONFIG.UNITS[u.type].health
    }));
    
    // Ajouter la base comme défenseur virtuel si présente
    if (defenderBase) {
        defenders.push({
            id: 'base',
            type: 'base',
            currentHealth: defenderBase.health,
            maxHealth: CONFIG.BASE_HEALTH,
            originalIdx: defenders.length,
            isBase: true
        });
    }
    
    // Combat tour par tour
    let turn = 0;
    const maxTurns = 50; // Limite pour éviter les boucles infinies
    
    while (turn < maxTurns) {
        turn++;
        
        // Les attaquants vivants
        const aliveAttackers = attackers.filter(a => a.currentHealth > 0);
        const aliveDefenders = defenders.filter(d => d.currentHealth > 0);
        
        if (aliveAttackers.length === 0 || aliveDefenders.length === 0) break;
        
        // Chaque attaquant attaque un défenseur avec son ATTACK ⚔️
        for (const attacker of aliveAttackers) {
            const targetIdx = Math.floor(Math.random() * aliveDefenders.length);
            const target = aliveDefenders[targetIdx];
            if (!target || target.currentHealth <= 0) continue;
            
            const attackConfig = CONFIG.UNITS[attacker.type];
            const defenseValue = target.isBase ? CONFIG.BASE_DEFENSE : CONFIG.UNITS[target.type].defense;
            
            // L'attaquant inflige des dégâts basés sur son ATTACK ⚔️
            // Modificateur de terrain désavantageux pour l'attaquant
            const baseDamage = attackConfig.attack * terrain.attackMod * (0.8 + Math.random() * 0.4);
            // La défense du défenseur réduit les dégâts
            const defenseReduction = defenseValue * terrain.defenseMod * 0.3;
            const damage = Math.max(5, baseDamage - defenseReduction);
            
            // Bonus d'embuscade: premiers dégâts réduits pour attaquants
            const finalDamage = (ambushTriggered && turn === 1) ? damage * 0.5 : damage;
            
            target.currentHealth -= finalDamage;
            const killed = target.currentHealth <= 0;
            
            rounds.push({
                attackerIdx: attacker.originalIdx,
                defenderIdx: target.originalIdx,
                attackerSide: 'attacker',
                damage: Math.round(finalDamage),
                killed,
                attackerType: attacker.type,
                defenderType: target.isBase ? 'base' : target.type,
                terrainEffect: terrain.name,
                ambush: ambushTriggered && turn === 1
            });
            
            if (killed) {
                // Recalculer les défenseurs vivants
                const stillAlive = defenders.filter(d => d.currentHealth > 0);
                if (stillAlive.length === 0) break;
            }
        }
        
        // Les défenseurs ripostent avec leur DÉFENSE
        const stillAliveDefenders = defenders.filter(d => d.currentHealth > 0 && !d.isBase);
        const stillAliveAttackers = attackers.filter(a => a.currentHealth > 0);
        
        if (stillAliveAttackers.length === 0) break;
        
        for (const defender of stillAliveDefenders) {
            if (stillAliveAttackers.length === 0) break;
            const targetIdx = Math.floor(Math.random() * stillAliveAttackers.length);
            const target = stillAliveAttackers[targetIdx];
            if (!target || target.currentHealth <= 0) continue;
            
            const defenseConfig = CONFIG.UNITS[defender.type];
            const attackerConfig = CONFIG.UNITS[target.type];
            
            // Les défenseurs infligent des dégâts basés sur leur DÉFENSE 🛡️
            // Bonus du terrain pour les défenseurs
            const baseDamage = defenseConfig.defense * terrain.defenseMod * (0.8 + Math.random() * 0.4);
            // L'attaquant a moins de réduction car il attaque
            const defenseReduction = attackerConfig.defense * 0.15;
            const damage = Math.max(3, baseDamage - defenseReduction);
            
            target.currentHealth -= damage;
            const killed = target.currentHealth <= 0;
            
            rounds.push({
                attackerIdx: defender.originalIdx,
                defenderIdx: target.originalIdx,
                attackerSide: 'defender',
                damage: Math.round(damage),
                killed,
                attackerType: defender.type,
                defenderType: target.type
            });
        }
    }
    
    // Déterminer le résultat
    const survivingAttackers = attackers.filter(a => a.currentHealth > 0);
    const survivingDefenders = defenders.filter(d => d.currentHealth > 0 && !d.isBase);
    const baseDestroyed = defenderBase && defenders.find(d => d.isBase)?.currentHealth <= 0;
    
    const attackerWins = survivingAttackers.length > 0 && survivingDefenders.length === 0;
    
    return {
        rounds,
        result: {
            attackerWins,
            survivingAttackers: survivingAttackers.length,
            survivingDefenders: survivingDefenders.length,
            baseDestroyed
        },
        attackers: attackers.map(a => ({
            id: a.id,
            type: a.type,
            health: Math.max(0, a.currentHealth),
            maxHealth: a.maxHealth,
            ownerId: a.ownerId,
            team: a.team
        })),
        defenders: defenders.filter(d => !d.isBase).map(d => ({
            id: d.id,
            type: d.type,
            health: Math.max(0, d.currentHealth),
            maxHealth: d.maxHealth,
            ownerId: d.ownerId,
            team: d.team
        })),
        survivingUnits: survivingAttackers.map(a => ({
            id: a.id,
            type: a.type,
            health: Math.max(1, Math.round(a.currentHealth)),
            ownerId: a.ownerId,
            team: a.team
        }))
    };
}

function resolveBattle(territory, attackingUnits, attackerId, attackerTeam) {
    const defendingUnits = territory.units.filter(u => u.team !== attackerTeam);
    const result = calculateBattleResult(attackingUnits, defendingUnits, territory.base);
    
    if (result.attackerWins) {
        const survivingAttackers = attackingUnits.filter(() => Math.random() < 0.7);
        const attackerKills = defendingUnits.length; // Tous les défenseurs sont tués
        
        // Ajouter les kills à l'attaquant
        addKillsToPlayer(attackerId, attackerKills);
        
        if (territory.base && territory.base.playerId !== attackerId) {
            territory.base.health -= result.attackPower * 2;
            if (territory.base.health <= 0) {
                const baseOwner = gameState.players.get(territory.base.playerId);
                if (baseOwner) {
                    baseOwner.hasBase = false;
                }
                territory.base = null;
            }
        }
        
        const previousTeam = territory.team;
        territory.owner = attackerId;
        territory.team = attackerTeam;
        territory.units = survivingAttackers;
        
        if (previousTeam) {
            gameState.teams[previousTeam].territories--;
        }
        gameState.teams[attackerTeam].territories++;
        
        return { success: true, message: `Territoire conquis!`, survivors: survivingAttackers.length };
    } else {
        const survivingDefenders = defendingUnits.filter(() => Math.random() < 0.6);
        const defenderKills = attackingUnits.length; // Tous les attaquants sont tués
        
        // Ajouter les kills aux défenseurs (trouver le propriétaire)
        if (defendingUnits.length > 0 && defendingUnits[0].ownerId) {
            addKillsToPlayer(defendingUnits[0].ownerId, defenderKills);
        }
        
        territory.units = survivingDefenders;
        
        return { success: false, message: `Attaque repoussée!`, defenders: survivingDefenders.length };
    }
}

// Fonction pour éliminer un joueur (quand sa base est détruite)
function eliminatePlayer(playerId, socketId) {
    const player = gameState.players.get(socketId);
    if (!player) return;
    
    console.log(`💀 ${player.name} a été éliminé!`);
    
    // Supprimer toutes les unités du joueur
    gameState.territories.forEach(territory => {
        const playerUnits = territory.units.filter(u => u.ownerId === player.oderId);
        if (playerUnits.length > 0) {
            territory.units = territory.units.filter(u => u.ownerId !== player.oderId);
            io.emit('territory_update', {
                id: territory.id,
                owner: territory.owner,
                team: territory.team,
                base: territory.base,
                units: territory.units,
                buildings: territory.buildings || []
            });
        }
    });
    
    // Supprimer les bâtiments du joueur
    gameState.territories.forEach(territory => {
        if (territory.buildings) {
            const hadBuildings = territory.buildings.some(b => b.ownerId === player.oderId);
            territory.buildings = territory.buildings.filter(b => b.ownerId !== player.oderId);
            if (hadBuildings) {
                io.emit('territory_update', {
                    id: territory.id,
                    owner: territory.owner,
                    team: territory.team,
                    base: territory.base,
                    units: territory.units,
                    buildings: territory.buildings || []
                });
            }
        }
    });
    
    // Marquer le joueur comme éliminé
    player.eliminated = true;
    player.hasBase = false;
    player.units = [];
    
    // Notifier tous les joueurs
    io.emit('player_eliminated', {
        playerId: player.oderId,
        playerName: player.name,
        team: player.team
    });
    
    // Notifier le joueur éliminé
    const playerSocket = io.sockets.sockets.get(socketId);
    if (playerSocket) {
        playerSocket.emit('you_eliminated', {
            message: 'Votre base a été détruite! Vous êtes éliminé.'
        });
    }
    
    saveGame();
}

// Résolution de combat avec données détaillées pour animation
function resolveBattleDetailed(territory, attackingUnits, attackerId, attackerTeam) {
    const defendingUnits = territory.units.filter(u => u.team !== attackerTeam);
    const battleData = calculateDetailedBattle(attackingUnits, defendingUnits, territory.base);
    
    // Variable pour stocker l'info d'élimination
    let eliminatedPlayer = null;
    
    // Calculer les kills pour chaque côté
    const attackerKills = battleData.defenders.filter(d => d.health <= 0).length;
    const defenderKills = battleData.attackers.filter(a => a.health <= 0).length;
    
    // Attribuer les kills
    if (attackerKills > 0) {
        addKillsToPlayer(attackerId, attackerKills);
    }
    if (defenderKills > 0 && defendingUnits.length > 0 && defendingUnits[0].ownerId) {
        addKillsToPlayer(defendingUnits[0].ownerId, defenderKills);
    }
    
    // Appliquer le résultat
    if (battleData.result.attackerWins) {
        if (battleData.result.baseDestroyed && territory.base) {
            const baseOwnerId = territory.base.playerId;
            const baseOwnerSocketId = territory.base.socketId;
            const baseOwner = gameState.players.get(baseOwnerSocketId);
            
            if (baseOwner) {
                eliminatedPlayer = { socketId: baseOwnerSocketId, playerId: baseOwner.oderId };
            }
            territory.base = null;
        }
        
        const previousTeam = territory.team;
        territory.owner = attackerId;
        territory.team = attackerTeam;
        territory.units = battleData.survivingUnits;
        
        if (previousTeam && previousTeam !== attackerTeam) {
            gameState.teams[previousTeam].territories--;
        }
        if (!previousTeam || previousTeam !== attackerTeam) {
            gameState.teams[attackerTeam].territories++;
        }
    } else {
        // Mettre à jour la santé des défenseurs survivants
        territory.units = battleData.defenders
            .filter(d => d.health > 0)
            .map(d => {
                const original = defendingUnits.find(u => u.id === d.id);
                return { ...original, health: d.health };
            });
    }
    
    // Éliminer le joueur si sa base a été détruite
    if (eliminatedPlayer) {
        eliminatePlayer(eliminatedPlayer.playerId, eliminatedPlayer.socketId);
    }
    
    return {
        battleData: {
            territoryId: territory.id,
            attackers: battleData.attackers,
            defenders: battleData.defenders,
            rounds: battleData.rounds,
            result: battleData.result,
            survivingUnits: battleData.survivingUnits,
            playerEliminated: eliminatedPlayer ? true : false
        },
        result: battleData.result,
        survivingUnits: battleData.survivingUnits
    };
}

// Résolution de combat entre deux groupes en mouvement qui se croisent
function resolveMovementCollision(territory, units1, team1, units2, team2) {
    // Créer des copies pour le combat
    const attackers = units1.map(u => ({
        ...u,
        currentHealth: u.health || CONFIG.UNITS[u.type].health
    }));
    const defenders = units2.map(u => ({
        ...u,
        currentHealth: u.health || CONFIG.UNITS[u.type].health
    }));
    
    const rounds = [];
    let roundNumber = 0;
    const maxRounds = 50;
    
    // Combat tour par tour
    while (attackers.some(u => u.currentHealth > 0) && 
           defenders.some(u => u.currentHealth > 0) && 
           roundNumber < maxRounds) {
        roundNumber++;
        const roundEvents = [];
        
        // Les attaquants frappent
        const aliveAttackers = attackers.filter(u => u.currentHealth > 0);
        const aliveDefenders = defenders.filter(u => u.currentHealth > 0);
        
        aliveAttackers.forEach(attacker => {
            if (aliveDefenders.length === 0) return;
            const target = aliveDefenders[Math.floor(Math.random() * aliveDefenders.length)];
            if (target.currentHealth <= 0) return;
            
            const attackerConfig = CONFIG.UNITS[attacker.type];
            const targetConfig = CONFIG.UNITS[target.type];
            const damage = Math.max(1, attackerConfig.attack - Math.floor(targetConfig.defense / 3));
            target.currentHealth -= damage;
            
            roundEvents.push({
                attackerId: attacker.id,
                attackerType: attacker.type,
                defenderId: target.id,
                defenderType: target.type,
                damage: damage,
                defenderHealth: Math.max(0, target.currentHealth),
                killed: target.currentHealth <= 0
            });
        });
        
        // Les défenseurs ripostent
        const stillAliveDefenders = defenders.filter(u => u.currentHealth > 0);
        const stillAliveAttackers = attackers.filter(u => u.currentHealth > 0);
        
        stillAliveDefenders.forEach(defender => {
            if (stillAliveAttackers.length === 0) return;
            const target = stillAliveAttackers[Math.floor(Math.random() * stillAliveAttackers.length)];
            if (target.currentHealth <= 0) return;
            
            const defenderConfig = CONFIG.UNITS[defender.type];
            const targetConfig = CONFIG.UNITS[target.type];
            const damage = Math.max(1, defenderConfig.attack - Math.floor(targetConfig.defense / 3));
            target.currentHealth -= damage;
            
            roundEvents.push({
                attackerId: defender.id,
                attackerType: defender.type,
                defenderId: target.id,
                defenderType: target.type,
                damage: damage,
                defenderHealth: Math.max(0, target.currentHealth),
                killed: target.currentHealth <= 0,
                isCounterAttack: true
            });
        });
        
        rounds.push({ round: roundNumber, events: roundEvents });
    }
    
    // Déterminer le gagnant
    const survivingTeam1 = attackers.filter(u => u.currentHealth > 0);
    const survivingTeam2 = defenders.filter(u => u.currentHealth > 0);
    
    // Calculer les kills pour chaque côté
    const team1Kills = defenders.filter(u => u.currentHealth <= 0).length;
    const team2Kills = attackers.filter(u => u.currentHealth <= 0).length;
    
    // Attribuer les kills aux propriétaires des unités
    if (team1Kills > 0 && units1.length > 0 && units1[0].ownerId) {
        addKillsToPlayer(units1[0].ownerId, team1Kills);
    }
    if (team2Kills > 0 && units2.length > 0 && units2[0].ownerId) {
        addKillsToPlayer(units2[0].ownerId, team2Kills);
    }
    
    let winner = null;
    let survivors = [];
    
    if (survivingTeam1.length > 0 && survivingTeam2.length === 0) {
        winner = team1;
        survivors = survivingTeam1.map(u => ({ ...u, health: u.currentHealth }));
    } else if (survivingTeam2.length > 0 && survivingTeam1.length === 0) {
        winner = team2;
        survivors = survivingTeam2.map(u => ({ ...u, health: u.currentHealth }));
    } else if (survivingTeam1.length > 0 && survivingTeam2.length > 0) {
        // Les deux ont des survivants - celui avec le plus gagne
        if (survivingTeam1.length >= survivingTeam2.length) {
            winner = team1;
            survivors = survivingTeam1.map(u => ({ ...u, health: u.currentHealth }));
        } else {
            winner = team2;
            survivors = survivingTeam2.map(u => ({ ...u, health: u.currentHealth }));
        }
    }
    // Si tous morts, winner reste null
    
    const battleData = {
        territoryId: territory.id,
        territoryName: territory.name,
        attackers: attackers.map(u => ({
            id: u.id,
            type: u.type,
            team: u.team,
            health: u.currentHealth,
            maxHealth: CONFIG.UNITS[u.type].health
        })),
        defenders: defenders.map(u => ({
            id: u.id,
            type: u.type,
            team: u.team,
            health: u.currentHealth,
            maxHealth: CONFIG.UNITS[u.type].health
        })),
        rounds: rounds,
        result: {
            attackerWins: winner === team1,
            defenderWins: winner === team2,
            draw: winner === null,
            team1Name: team1,
            team2Name: team2,
            winnerTeam: winner
        },
        collisionBattle: true // Marquer comme combat de collision
    };
    
    return {
        battleData,
        winner,
        survivors
    };
}

// Résolution de combat à distance (artillerie) - ne capture pas, fait juste des dégâts
function resolveRangedBattle(territory, artilleryUnits, attackerId, attackerTeam) {
    const defendingUnits = territory.units.filter(u => u.team !== attackerTeam);
    
    // Calculer les dégâts totaux de l'artillerie (utilise rangeAttack)
    let totalDamage = 0;
    artilleryUnits.forEach(artillery => {
        totalDamage += CONFIG.UNITS.artillery.rangeAttack;
    });
    
    // Répartir les dégâts sur les défenseurs
    const rounds = [];
    const defenders = defendingUnits.map(u => ({
        id: u.id,
        type: u.type,
        currentHealth: u.health || CONFIG.UNITS[u.type].health,
        maxHealth: CONFIG.UNITS[u.type].health
    }));
    
    let remainingDamage = totalDamage;
    let roundNum = 1;
    
    // Bombarder les unités
    while (remainingDamage > 0 && defenders.some(d => d.currentHealth > 0)) {
        const aliveDefenders = defenders.filter(d => d.currentHealth > 0);
        if (aliveDefenders.length === 0) break;
        
        // Choisir une cible aléatoire
        const target = aliveDefenders[Math.floor(Math.random() * aliveDefenders.length)];
        const damageThisHit = Math.min(remainingDamage, 20 + Math.floor(Math.random() * 15));
        
        target.currentHealth -= damageThisHit;
        remainingDamage -= damageThisHit;
        
        rounds.push({
            round: roundNum++,
            attackerId: artilleryUnits[0].id,
            attackerType: 'artillery',
            defenderId: target.id,
            defenderType: target.type,
            damage: damageThisHit,
            defenderHealth: Math.max(0, target.currentHealth),
            isRanged: true
        });
    }
    
    // Mettre à jour les unités sur le territoire
    territory.units = defendingUnits.map(u => {
        const defenderState = defenders.find(d => d.id === u.id);
        if (defenderState && defenderState.currentHealth > 0) {
            return { ...u, health: Math.round(defenderState.currentHealth) };
        }
        return null;
    }).filter(u => u !== null);
    
    const killed = defendingUnits.length - territory.units.length;
    
    // Ajouter les kills à l'attaquant (artillerie)
    if (killed > 0) {
        addKillsToPlayer(attackerId, killed);
    }
    
    return {
        battleData: {
            territoryId: territory.id,
            attackers: artilleryUnits.map(a => ({
                id: a.id,
                type: a.type,
                health: a.health || CONFIG.UNITS.artillery.health,
                maxHealth: CONFIG.UNITS.artillery.health
            })),
            defenders: defenders.map(d => ({
                id: d.id,
                type: d.type,
                health: Math.max(0, d.currentHealth),
                maxHealth: d.maxHealth
            })),
            rounds: rounds,
            result: {
                attackerWins: false, // L'artillerie à distance ne capture jamais
                isRangedAttack: true,
                totalDamage: totalDamage,
                unitsKilled: killed
            }
        },
        result: {
            success: killed > 0,
            totalDamage: totalDamage,
            unitsKilled: killed
        }
    };
}

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
    console.log(`🔌 Connexion: ${socket.id}`);
    
    let player = null;
    let authenticatedUser = null; // Utilisateur authentifié

    // Authentification par token
    socket.on('authenticate', async ({ token }) => {
        try {
            const session = await db.validateSession(token);
            if (session) {
                authenticatedUser = {
                    id: session.user_id,
                    username: session.username
                };
                await db.updateSessionSocket(token, socket.id);
                socket.emit('authenticated', { 
                    success: true, 
                    user: authenticatedUser 
                });
                console.log(`🔐 Socket authentifié: ${authenticatedUser.username}`);
            } else {
                socket.emit('authenticated', { success: false, error: 'Session invalide' });
            }
        } catch (err) {
            socket.emit('authenticated', { success: false, error: err.message });
        }
    });
    
    // Rejoindre le jeu (avec ou sans authentification)
    socket.on('join_game', async ({ playerName, token, loadSavedData, isSpectator }) => {
        
        // MODE SPECTATEUR
        if (isSpectator) {
            player = {
                oderId: socket.id,
                name: playerName || 'Spectateur',
                team: null,
                isSpectator: true,
                resources: { gold: 0, food: 0 },
                hasBase: false,
                eliminated: false
            };
            
            gameState.players.set(socket.id, player);
            
            console.log(`👁️ ${player.name} a rejoint en tant que spectateur`);
            
            socket.emit('game_joined', {
                player: {
                    id: socket.id,
                    name: player.name,
                    team: null,
                    isSpectator: true,
                    resources: player.resources
                },
                territories: gameState.territories.map(t => ({
                    id: t.id,
                    name: t.name,
                    owner: t.owner,
                    team: t.team,
                    base: t.base,
                    units: t.units,
                    buildings: t.buildings || [],
                    neighbors: t.neighbors,
                    centerX: t.centerX,
                    centerY: t.centerY,
                    terrain: t.terrain
                })),
                teams: getTeamsData(),
                config: CONFIG,
                weather: { current: gameState.currentWeather },
                warPeace: {
                    isWar: gameState.warPeaceState.isWar,
                    nextChange: gameState.warPeaceState.nextChangeTime
                }
            });
            
            io.emit('chat_message', {
                author: '📢 Système',
                team: 'system',
                message: `👁️ ${player.name} observe la partie`,
                timestamp: Date.now()
            });
            
            return;
        }
        
        let savedData = null;
        let savedUnits = [];
        let savedBuildings = [];
        let team = getTeamWithLeastPlayers();
        
        // Si token fourni, charger les données sauvegardées
        if (token) {
            try {
                const session = await db.validateSession(token);
                if (session) {
                    authenticatedUser = { id: session.user_id, username: session.username };
                    await db.updateSessionSocket(token, socket.id);
                    
                    if (loadSavedData) {
                        savedData = await db.loadPlayerGameData(session.user_id);
                        savedUnits = await db.loadPlayerUnits(session.user_id);
                        savedBuildings = await db.loadPlayerBuildings(session.user_id);
                        if (savedData && savedData.team) {
                            team = savedData.team;
                        }
                    }
                }
            } catch (err) {
                console.error('Erreur chargement données:', err);
            }
        }
        
        player = {
            oderId: socket.id,
            name: authenticatedUser ? authenticatedUser.username : (playerName || 'Commandant'),
            team: team,
            resources: savedData ? {
                gold: savedData.gold || CONFIG.STARTING_GOLD,
                food: savedData.food || CONFIG.STARTING_FOOD
            } : {
                gold: CONFIG.STARTING_GOLD,
                food: CONFIG.STARTING_FOOD
            },
            hasBase: savedData ? savedData.hasBase : false,
            baseTerritory: savedData ? savedData.baseTerritoryId : null,
            productionQueue: [],
            units: [],
            kills: savedData ? (savedData.kills || 0) : 0,
            technologies: savedData ? (savedData.technologies || {
                improvedAttack: false,
                improvedDefense: false,
                improvedSpeed: false,
                improvedVision: false,
                improvedHeal: false
            }) : {
                improvedAttack: false,
                improvedDefense: false,
                improvedSpeed: false,
                improvedVision: false,
                improvedHeal: false
            },
            userId: authenticatedUser ? authenticatedUser.id : null // Lier au compte utilisateur
        };
        
        gameState.players.set(socket.id, player);
        gameState.teams[team].players.push(socket.id);
        
        // ==================== RESTAURER LES UNITÉS ET BÂTIMENTS SAUVEGARDÉS ====================
        if (savedUnits && savedUnits.length > 0) {
            console.log(`📦 Restauration de ${savedUnits.length} unités pour ${player.name}`);
            savedUnits.forEach(savedUnit => {
                const territory = gameState.territories[savedUnit.territoryId];
                if (territory && territory.team === player.team) {
                    // Créer l'unité avec les stats de base
                    const unitDef = UNIT_TYPES[savedUnit.type];
                    if (unitDef) {
                        const newUnit = {
                            id: `unit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            type: savedUnit.type,
                            ownerId: player.oderId,
                            team: player.team,
                            health: savedUnit.health || unitDef.health,
                            maxHealth: unitDef.health,
                            attack: unitDef.attack,
                            defense: unitDef.defense,
                            speed: unitDef.speed
                        };
                        if (!territory.units) territory.units = [];
                        territory.units.push(newUnit);
                    }
                }
            });
        }
        
        if (savedBuildings && savedBuildings.length > 0) {
            console.log(`🏗️ Restauration de ${savedBuildings.length} bâtiments pour ${player.name}`);
            savedBuildings.forEach(savedBuilding => {
                const territory = gameState.territories[savedBuilding.territoryId];
                if (territory && territory.team === player.team) {
                    const buildingDef = CONFIG.BUILDINGS[savedBuilding.type];
                    if (buildingDef) {
                        const newBuilding = {
                            id: `building_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            type: savedBuilding.type,
                            ownerId: player.oderId,
                            team: player.team,
                            health: savedBuilding.health || buildingDef.health,
                            maxHealth: buildingDef.health
                        };
                        if (!territory.buildings) territory.buildings = [];
                        territory.buildings.push(newBuilding);
                    }
                }
            });
        }
        
        // Restaurer la base si le joueur en avait une
        if (savedData && savedData.hasBase && savedData.baseTerritoryId !== null) {
            const baseTerritory = gameState.territories[savedData.baseTerritoryId];
            if (baseTerritory && baseTerritory.team === player.team && !baseTerritory.base) {
                baseTerritory.base = {
                    ownerId: player.oderId,
                    team: player.team,
                    health: 1000,
                    maxHealth: 1000
                };
                player.hasBase = true;
                player.baseTerritory = savedData.baseTerritoryId;
                console.log(`🏰 Base restaurée pour ${player.name} sur ${baseTerritory.name}`);
            } else {
                // Le territoire n'est plus disponible, le joueur devra replacer sa base
                player.hasBase = false;
                player.baseTerritory = null;
                console.log(`⚠️ Impossible de restaurer la base de ${player.name} - territoire non disponible`);
            }
        }
        
        socket.emit('game_joined', {
            player: {
                oderId: player.oderId,
                name: player.name,
                team: player.team,
                resources: player.resources,
                hasBase: player.hasBase,
                technologies: player.technologies,
                isAuthenticated: !!authenticatedUser
            },
            mapSeed: gameState.mapSeed,
            territories: gameState.territories.map(t => ({
                id: t.id,
                name: t.name,
                centerX: t.centerX,
                centerY: t.centerY,
                owner: t.owner,
                team: t.team,
                units: t.units,
                base: t.base,
                buildings: t.buildings || [],
                neighbors: t.neighbors,
                resources: t.resources,
                terrain: t.terrain || 'plains', // Type de terrain
                bonusResource: t.bonusResource,
                bonusAmount: t.bonusAmount
            })),
            teams: {
                red: { playerCount: gameState.teams.red.players.length, territories: gameState.teams.red.territories },
                blue: { playerCount: gameState.teams.blue.players.length, territories: gameState.teams.blue.territories },
                green: { playerCount: gameState.teams.green.players.length, territories: gameState.teams.green.territories },
                yellow: { playerCount: gameState.teams.yellow.players.length, territories: gameState.teams.yellow.territories }
            },
            config: CONFIG,
            weather: gameState.weather,
            warPeace: {
                isWar: gameState.warPeace.isWar,
                nextChange: gameState.warPeace.nextChange
            }
        });
        
        io.emit('player_joined', {
            oderId: player.oderId,
            name: player.name,
            team: player.team
        });
        
        io.emit('teams_update', getTeamsData());
        
        console.log(`👤 ${player.name} rejoint l'équipe ${team}`);
    });
    
    // Placer sa base
    socket.on('place_base', ({ territoryId }) => {
        if (!player || player.hasBase || player.isSpectator) {
            socket.emit('error', { message: 'Vous avez déjà une base!' });
            return;
        }
        
        const territory = gameState.territories[territoryId];
        
        // Le territoire doit exister
        if (!territory) {
            socket.emit('error', { message: 'Territoire invalide' });
            return;
        }
        
        // Le territoire doit appartenir à l'équipe du joueur (pas neutre!)
        if (territory.team !== player.team) {
            socket.emit('error', { message: 'Ce territoire doit appartenir à votre équipe!' });
            return;
        }
        
        // Initialiser le tableau de bases si nécessaire
        if (!territory.bases) {
            territory.bases = [];
            // Migrer l'ancienne base si elle existe
            if (territory.base) {
                territory.bases.push(territory.base);
            }
        }
        
        const newBase = {
            playerId: player.oderId,
            socketId: socket.id,
            playerName: player.name,
            team: player.team,
            health: CONFIG.BASE_HEALTH,
            canProduce: ['infantry', 'builder', 'scout', 'medic']
        };
        
        territory.bases.push(newBase);
        territory.base = newBase; // Garder compatibilité avec l'ancien code
        territory.owner = player.oderId;
        territory.buildings = territory.buildings || [];
        
        player.hasBase = true;
        player.baseTerritory = territoryId;
        
        io.emit('base_placed', {
            territoryId: territoryId,
            playerId: player.oderId,
            playerName: player.name,
            team: player.team,
            bases: territory.bases // Envoyer toutes les bases
        });
        
        io.emit('territory_update', {
            id: territory.id,
            owner: territory.owner,
            team: territory.team,
            base: territory.base,
            bases: territory.bases, // Envoyer toutes les bases
            units: territory.units,
            buildings: territory.buildings || []
        });
        
        socket.emit('player_update', {
            hasBase: true,
            baseTerritory: territoryId
        });
        
        console.log(`🏰 ${player.name} a placé sa base sur ${territory.name} (${territory.bases.length} base(s) sur ce territoire)`);
        saveGame();
    });
    
    // Produire une unité (depuis la base ou un bâtiment)
    socket.on('produce_unit', ({ unitType, territoryId }) => {
        if (!player || !player.hasBase || player.isSpectator) return;
        if (player.eliminated) return;
        
        const unitConfig = CONFIG.UNITS[unitType];
        if (!unitConfig) return;
        
        // Vérifier la limite d'unités du joueur
        const playerUnitCount = countPlayerUnits(player.oderId);
        const unitsInProduction = (player.productionQueue || []).length;
        if (playerUnitCount + unitsInProduction >= CONFIG.MAX_UNITS_PER_PLAYER) {
            socket.emit('error', { message: `Limite de ${CONFIG.MAX_UNITS_PER_PLAYER} unités atteinte!` });
            return;
        }
        
        // Déterminer le lieu de production
        const productionTerritoryId = territoryId || player.baseTerritory;
        const territory = gameState.territories[productionTerritoryId];
        if (!territory) return;
        
        // Vérifier que le territoire appartient au joueur/équipe
        if (territory.team !== player.team) {
            socket.emit('error', { message: 'Ce territoire ne vous appartient pas' });
            return;
        }
        
        // Vérifier que le bâtiment/base peut produire ce type d'unité
        let canProduce = false;
        let productionSource = null;
        
        // Vérifier la base
        if (territory.base && territory.base.playerId === player.oderId) {
            if (territory.base.canProduce && territory.base.canProduce.includes(unitType)) {
                canProduce = true;
                productionSource = 'base';
            }
        }
        
        // Vérifier les bâtiments sur le territoire
        if (!canProduce && territory.buildings) {
            for (const building of territory.buildings) {
                if (building.ownerId === player.oderId) {
                    const buildingConfig = CONFIG.BUILDINGS[building.type];
                    if (buildingConfig && buildingConfig.canProduce && buildingConfig.canProduce.includes(unitType)) {
                        canProduce = true;
                        productionSource = building.type;
                        break;
                    }
                }
            }
        }
        
        if (!canProduce) {
            socket.emit('error', { message: `Aucun bâtiment ne peut produire ${unitConfig.name} sur ce territoire` });
            return;
        }
        
        if (player.resources.gold < unitConfig.cost.gold || 
            player.resources.food < unitConfig.cost.food) {
            socket.emit('error', { message: 'Ressources insuffisantes' });
            return;
        }
        
        player.resources.gold -= unitConfig.cost.gold;
        player.resources.food -= unitConfig.cost.food;
        
        const productionItem = {
            id: Date.now() + Math.random(),
            type: unitType,
            startTime: Date.now(),
            endTime: Date.now() + unitConfig.buildTime,
            territoryId: productionTerritoryId
        };
        
        player.productionQueue.push(productionItem);
        
        socket.emit('production_started', {
            item: productionItem,
            resources: player.resources
        });
        
        setTimeout(() => {
            if (!gameState.players.has(socket.id)) return;
            if (player.eliminated) return;
            
            const prodTerritory = gameState.territories[productionTerritoryId];
            if (!prodTerritory || prodTerritory.team !== player.team) {
                // Le territoire a été perdu pendant la production
                socket.emit('error', { message: 'Production annulée - territoire perdu!' });
                return;
            }
            
            const unit = {
                id: Date.now() + Math.random(),
                type: unitType,
                ownerId: player.oderId,
                team: player.team,
                health: unitConfig.health,
                territoryId: productionTerritoryId
            };
            
            player.units.push(unit);
            prodTerritory.units.push(unit);
            
            player.productionQueue = player.productionQueue.filter(p => p.id !== productionItem.id);
            
            socket.emit('unit_produced', { unit, territoryId: productionTerritoryId });
            io.emit('territory_update', {
                id: productionTerritoryId,
                owner: prodTerritory.owner,
                team: prodTerritory.team,
                base: prodTerritory.base,
                units: prodTerritory.units,
                buildings: prodTerritory.buildings || []
            });
            
            console.log(`⚔️ ${player.name} a produit: ${unitConfig.name}`);
        }, unitConfig.buildTime);
    });
    
    // Construire un bâtiment avec un Builder
    socket.on('build_structure', ({ builderId, buildingType, territoryId }) => {
        if (!player || !player.hasBase || player.eliminated || player.isSpectator) return;
        
        const buildingConfig = CONFIG.BUILDINGS[buildingType];
        if (!buildingConfig) {
            socket.emit('error', { message: 'Type de bâtiment invalide' });
            return;
        }
        
        const territory = gameState.territories[territoryId];
        if (!territory) return;
        
        // Vérifier que le territoire appartient à l'équipe
        if (territory.team !== player.team) {
            socket.emit('error', { message: 'Ce territoire ne vous appartient pas' });
            return;
        }
        
        // Vérifier qu'il y a un Builder sur ce territoire
        const builder = territory.units.find(u => 
            u.id === builderId && 
            u.ownerId === player.oderId && 
            u.type === 'builder'
        );
        
        if (!builder) {
            socket.emit('error', { message: 'Pas de constructeur sur ce territoire' });
            return;
        }
        
        // Initialiser le tableau de bâtiments si nécessaire
        territory.buildings = territory.buildings || [];
        
        // Vérifier les ressources
        if (player.resources.gold < buildingConfig.cost.gold) {
            socket.emit('error', { message: 'Or insuffisant' });
            return;
        }
        
        player.resources.gold -= buildingConfig.cost.gold;
        
        // Le builder est occupé pendant la construction
        builder.isBuilding = true;
        builder.buildingEndTime = Date.now() + buildingConfig.buildTime;
        
        socket.emit('construction_started', {
            builderId: builderId,
            buildingType: buildingType,
            territoryId: territoryId,
            endTime: builder.buildingEndTime,
            resources: player.resources
        });
        
        setTimeout(() => {
            if (!gameState.players.has(socket.id)) return;
            if (player.eliminated) return;
            
            const buildTerritory = gameState.territories[territoryId];
            if (!buildTerritory || buildTerritory.team !== player.team) {
                socket.emit('error', { message: 'Construction annulée - territoire perdu!' });
                return;
            }
            
            // Vérifier que le builder est toujours là
            const builderStillHere = buildTerritory.units.find(u => u.id === builderId);
            if (!builderStillHere) {
                socket.emit('error', { message: 'Construction annulée - constructeur disparu!' });
                return;
            }
            
            builderStillHere.isBuilding = false;
            
            const building = {
                id: Date.now() + Math.random(),
                type: buildingType,
                ownerId: player.oderId,
                team: player.team,
                health: buildingConfig.health,
                territoryId: territoryId
            };
            
            buildTerritory.buildings = buildTerritory.buildings || [];
            buildTerritory.buildings.push(building);
            
            socket.emit('building_completed', { 
                building: building,
                territoryId: territoryId
            });
            
            io.emit('territory_update', {
                id: territoryId,
                owner: buildTerritory.owner,
                team: buildTerritory.team,
                base: buildTerritory.base,
                units: buildTerritory.units,
                buildings: buildTerritory.buildings
            });
            
            console.log(`🏗️ ${player.name} a construit: ${buildingConfig.name} sur ${buildTerritory.name}`);
            saveGame();
        }, buildingConfig.buildTime);
    });
    
    // Déplacer des unités avec chemin et temps de marche
    socket.on('move_units', ({ unitIds, fromTerritoryId, toTerritoryId, path }) => {
        if (!player || player.isSpectator) return;
        
        const fromTerritory = gameState.territories[fromTerritoryId];
        if (!fromTerritory) return;
        
        // Vérifier que les unités appartiennent au joueur
        const unitsToMove = fromTerritory.units.filter(u => 
            unitIds.includes(u.id) && u.ownerId === player.oderId
        );
        
        if (unitsToMove.length === 0) return;
        
        // Construire le chemin (si path fourni, sinon chemin direct)
        let marchPath = path || [fromTerritoryId, toTerritoryId];
        
        // Valider le chemin (chaque étape doit être voisine de la précédente)
        for (let i = 1; i < marchPath.length; i++) {
            const prevTerritory = gameState.territories[marchPath[i - 1]];
            if (!prevTerritory.neighbors.includes(marchPath[i])) {
                socket.emit('error', { message: 'Chemin invalide' });
                return;
            }
        }
        
        // *** COÛT DE NOURRITURE POUR LE DÉPLACEMENT ***
        const totalSteps = marchPath.length - 1;
        const foodCost = unitsToMove.length * totalSteps * CONFIG.FOOD_PER_MOVE;
        
        if (player.resources.food < foodCost) {
            socket.emit('error', { message: `Nourriture insuffisante! (${foodCost} 🍖 requis)` });
            return;
        }
        
        // Déduire la nourriture
        player.resources.food -= foodCost;
        socket.emit('resources_update', player.resources);
        
        // Calculer le temps de marche (basé sur l'unité la plus lente = marchTime le plus élevé)
        let slowestMarchTime = 0;
        unitsToMove.forEach(u => {
            const unitConfig = CONFIG.UNITS[u.type];
            if (unitConfig.marchTime > slowestMarchTime) {
                slowestMarchTime = unitConfig.marchTime;
            }
        });
        
        // Appliquer effet météo sur la vitesse (speedMod < 1 = plus lent = temps plus long)
        const weatherEffect = CONFIG.WEATHER.effects[gameState.weather.current];
        // Appliquer aussi le multiplicateur de guerre/paix (pendant la paix, vitesse x3)
        const warPeaceMultiplier = getCurrentSpeedMultiplier();
        const timePerTerritory = Math.round(slowestMarchTime / (weatherEffect.speedMod * warPeaceMultiplier));
        const totalTime = timePerTerritory * totalSteps;
        
        // Retirer les unités du territoire de départ
        fromTerritory.units = fromTerritory.units.filter(u => !unitIds.includes(u.id));
        
        // Créer l'objet de mouvement
        const movementId = Date.now() + Math.random();
        const movement = {
            id: movementId,
            units: unitsToMove,
            ownerId: player.oderId,
            team: player.team,
            path: marchPath,
            currentStep: 0,
            startTime: Date.now(),
            timePerTerritory: timePerTerritory,
            nextArrivalTime: Date.now() + timePerTerritory
        };
        
        gameState.movingUnits.push(movement);
        
        // Notifier seulement l'équipe du joueur (pas les ennemis)
        emitToTeam(player.team, 'units_marching', {
            movementId: movementId,
            units: unitsToMove.map(u => ({ id: u.id, type: u.type, team: u.team })),
            path: marchPath,
            startTime: movement.startTime,
            timePerTerritory: timePerTerritory,
            totalTime: totalTime,
            team: player.team
        });
        
        io.emit('territory_update', {
            id: fromTerritory.id,
            owner: fromTerritory.owner,
            team: fromTerritory.team,
            base: fromTerritory.base,
            units: fromTerritory.units,
            buildings: fromTerritory.buildings || []
        });
        
        socket.emit('units_moved', {
            fromTerritoryId,
            toTerritoryId: marchPath[marchPath.length - 1],
            marching: true,
            movementId: movementId,
            totalTime: totalTime
        });
        
        console.log(`🚶 ${player.name} déplace ${unitsToMove.length} unités: ${marchPath.length - 1} étapes, ${totalTime}ms`);
        saveGame();
    });
    
    // Attaque artillerie longue portée
    socket.on('artillery_attack', ({ unitIds, fromTerritoryId, toTerritoryId }) => {
        if (!player || player.isSpectator) return;
        
        const fromTerritory = gameState.territories[fromTerritoryId];
        const toTerritory = gameState.territories[toTerritoryId];
        
        if (!fromTerritory || !toTerritory) return;
        
        // Vérifier que les unités sont de l'artillerie et appartiennent au joueur
        const artilleryUnits = fromTerritory.units.filter(u => 
            unitIds.includes(u.id) && u.ownerId === player.oderId && u.type === 'artillery'
        );
        
        if (artilleryUnits.length === 0) {
            socket.emit('error', { message: 'Aucune artillerie sélectionnée' });
            return;
        }
        
        // Vérifier le rechargement de chaque artillerie
        const now = Date.now();
        const readyArtillery = artilleryUnits.filter(u => {
            if (!u.lastFireTime) return true;
            return (now - u.lastFireTime) >= CONFIG.UNITS.artillery.reloadTime;
        });
        
        if (readyArtillery.length === 0) {
            const nextReady = Math.min(...artilleryUnits.map(u => {
                const remaining = CONFIG.UNITS.artillery.reloadTime - (now - (u.lastFireTime || 0));
                return Math.max(0, remaining);
            }));
            socket.emit('error', { message: `Artillerie en rechargement! (${Math.ceil(nextReady/1000)}s)` });
            return;
        }
        
        // Vérifier la portée (2 cases)
        const visited = new Set([fromTerritoryId]);
        let frontier = [fromTerritoryId];
        let inRange = false;
        
        for (let depth = 1; depth <= CONFIG.UNITS.artillery.range; depth++) {
            const nextFrontier = [];
            frontier.forEach(tId => {
                const t = gameState.territories[tId];
                if (!t) return;
                t.neighbors.forEach(neighborId => {
                    if (!visited.has(neighborId)) {
                        visited.add(neighborId);
                        nextFrontier.push(neighborId);
                        if (neighborId === toTerritoryId) inRange = true;
                    }
                });
            });
            frontier = nextFrontier;
        }
        
        if (!inRange) {
            socket.emit('error', { message: 'Cible hors de portée' });
            return;
        }
        
        // Vérifier que c'est un territoire ennemi avec des unités
        if (!toTerritory.team || toTerritory.team === player.team) {
            socket.emit('error', { message: 'Cible non ennemie' });
            return;
        }
        
        // Marquer le temps de tir pour chaque artillerie prête
        readyArtillery.forEach(u => {
            u.lastFireTime = now;
        });
        
        // Combat à distance avec dégâts de portée (rangeAttack)
        const battleResult = resolveRangedBattle(toTerritory, readyArtillery, player.oderId, player.team);
        
        // Notifier le joueur du rechargement
        const reloadSeconds = CONFIG.UNITS.artillery.reloadTime / 1000;
        socket.emit('artillery_fired', { 
            unitIds: readyArtillery.map(u => u.id),
            reloadTime: CONFIG.UNITS.artillery.reloadTime
        });
        
        // L'artillerie ne bouge pas, elle reste sur place mais tire
        // Les dégâts sont appliqués à distance
        
        // Envoyer le résultat du combat - uniquement au joueur attaquant et à l'équipe défenseur
        emitToBattleParticipants(socket.id, toTerritory.team || player.team, 'battle_start', battleResult.battleData);
        
        io.emit('territory_update', {
            id: toTerritory.id,
            owner: toTerritory.owner,
            team: toTerritory.team,
            base: toTerritory.base,
            units: toTerritory.units,
            buildings: toTerritory.buildings || []
        });
        
        io.emit('teams_update', getTeamsData());
        
        console.log(`💥 ${player.name} - Tir d'artillerie sur ${toTerritory.name}`);
        saveGame();
    });
    
    // Chat
    socket.on('chat_message', (message) => {
        if (!player) return;
        
        io.emit('chat_message', {
            author: player.name,
            team: player.team,
            message: message.substring(0, 200),
            timestamp: Date.now()
        });
    });
    
    // Rechercher une technologie
    socket.on('research_technology', ({ techName }) => {
        if (!player || !player.hasBase || player.eliminated || player.isSpectator) return;
        
        const techCosts = {
            improvedAttack: { gold: 500, food: 100 },
            improvedDefense: { gold: 500, food: 100 },
            improvedSpeed: { gold: 400, food: 150 },
            improvedVision: { gold: 300, food: 50 },
            improvedHeal: { gold: 350, food: 80 }
        };
        
        if (!techCosts[techName]) {
            socket.emit('error', { message: 'Technologie invalide' });
            return;
        }
        
        if (player.technologies[techName]) {
            socket.emit('error', { message: 'Technologie déjà recherchée' });
            return;
        }
        
        const cost = techCosts[techName];
        if (player.resources.gold < cost.gold || player.resources.food < cost.food) {
            socket.emit('error', { message: 'Ressources insuffisantes' });
            return;
        }
        
        player.resources.gold -= cost.gold;
        player.resources.food -= cost.food;
        player.technologies[techName] = true;
        
        socket.emit('resources_update', player.resources);
        socket.emit('technology_researched', {
            techName: techName,
            technologies: player.technologies
        });
        
        console.log(`🔬 ${player.name} a recherché: ${techName}`);
    });
    
    // Sauvegarde manuelle des données
    socket.on('save_game_data', async () => {
        if (player && authenticatedUser) {
            await savePlayerToDatabase(authenticatedUser.id, player);
            socket.emit('game_saved', { success: true });
        }
    });
    
    // Déconnexion
    socket.on('disconnect', async () => {
        if (player) {
            // Sauvegarder les données du joueur authentifié
            if (authenticatedUser) {
                try {
                    await savePlayerToDatabase(authenticatedUser.id, player);
                    await db.logoutUser(authenticatedUser.id);
                    console.log(`💾 Données sauvegardées pour ${authenticatedUser.username}`);
                } catch (err) {
                    console.error('Erreur sauvegarde déconnexion:', err);
                }
            }
            
            gameState.teams[player.team].players = 
                gameState.teams[player.team].players.filter(id => id !== socket.id);
            
            gameState.players.delete(socket.id);
            
            io.emit('player_left', { oderId: socket.id, name: player.name, team: player.team });
            io.emit('teams_update', getTeamsData());
            
            console.log(`👤 ${player.name} déconnecté`);
            saveGame();
        }
    });
});

// ==================== CYCLE DE RESSOURCES ====================
setInterval(() => {
    gameState.players.forEach((player, oderId) => {
        if (player.hasBase) {
            updatePlayerResources(player);
            
            const socket = io.sockets.sockets.get(oderId);
            if (socket) {
                socket.emit('resources_update', player.resources);
            }
        }
    });
}, CONFIG.RESOURCE_TICK);

// ==================== CYCLE GUERRE/PAIX ====================
setInterval(() => {
    const now = Date.now();
    
    if (now >= gameState.warPeace.nextChange) {
        // Basculer l'état
        gameState.warPeace.isWar = !gameState.warPeace.isWar;
        gameState.warPeace.nextChange = now + CONFIG.WAR_PEACE.cycleDuration;
        gameState.warPeace.cycleStartTime = now;
        
        const stateName = gameState.warPeace.isWar ? '⚔️ GUERRE' : '🕊️ PAIX';
        const stateEmoji = gameState.warPeace.isWar ? '⚔️' : '🕊️';
        
        console.log(`\n${'='.repeat(50)}`);
        console.log(`${stateEmoji} Changement d'état: ${stateName}`);
        console.log(`${'='.repeat(50)}\n`);
        
        // Notifier tous les joueurs
        io.emit('war_peace_change', {
            isWar: gameState.warPeace.isWar,
            nextChange: gameState.warPeace.nextChange,
            stateName: stateName
        });
        
        saveGame();
    }
}, 1000); // Vérifier chaque seconde

// Fonction pour obtenir le multiplicateur de vitesse actuel
function getCurrentSpeedMultiplier() {
    const baseMultiplier = gameState.warPeace.isWar 
        ? CONFIG.WAR_PEACE.warSpeedMultiplier 
        : CONFIG.WAR_PEACE.peaceSpeedMultiplier;
    return baseMultiplier;
}

// Fonction pour vérifier si une attaque est autorisée
function canAttackTerritory(attackerTeam, targetTerritory) {
    // Pendant la paix, on ne peut attaquer que les territoires neutres
    if (!gameState.warPeace.isWar) {
        if (targetTerritory.team && targetTerritory.team !== attackerTeam) {
            return { allowed: false, reason: '🕊️ Période de PAIX! Vous ne pouvez attaquer que les territoires neutres.' };
        }
    }
    return { allowed: true };
}

// ==================== CYCLE DE MOUVEMENT DES TROUPES ====================
setInterval(() => {
    const now = Date.now();
    const completedMovements = [];
    
    // D'abord, mettre à jour les positions de tous les mouvements
    gameState.movingUnits.forEach((movement, index) => {
        if (now >= movement.nextArrivalTime && !movement.processed) {
            movement.currentStep++;
            movement.currentTerritoryId = movement.path[movement.currentStep];
            movement.processed = true; // Marquer comme traité pour cette frame
        }
    });
    
    // Ensuite, vérifier les collisions entre mouvements ennemis sur le même territoire
    const movementsByTerritory = {};
    gameState.movingUnits.forEach((movement, index) => {
        if (movement.processed && !movement.collisionHandled) {
            const terrId = movement.currentTerritoryId;
            if (!movementsByTerritory[terrId]) {
                movementsByTerritory[terrId] = [];
            }
            movementsByTerritory[terrId].push({ movement, index });
        }
    });
    
    // Gérer les collisions entre mouvements
    Object.entries(movementsByTerritory).forEach(([terrIdStr, movements]) => {
        if (movements.length < 2) return;
        
        // Regrouper par équipe
        const byTeam = {};
        movements.forEach(m => {
            if (!byTeam[m.movement.team]) byTeam[m.movement.team] = [];
            byTeam[m.movement.team].push(m);
        });
        
        const teams = Object.keys(byTeam);
        if (teams.length < 2) return; // Pas de collision ennemie
        
        // Il y a des ennemis qui se croisent!
        const terrId = parseInt(terrIdStr);
        const territory = gameState.territories[terrId];
        
        // Combiner toutes les unités par équipe
        const teamUnits = {};
        teams.forEach(team => {
            teamUnits[team] = [];
            byTeam[team].forEach(m => {
                teamUnits[team].push(...m.movement.units);
            });
        });
        
        // Combat entre les deux premières équipes ennemies
        const team1 = teams[0];
        const team2 = teams[1];
        const units1 = teamUnits[team1];
        const units2 = teamUnits[team2];
        
        console.log(`⚔️ Collision en route! ${team1} (${units1.length}) vs ${team2} (${units2.length}) sur ${territory.name}`);
        
        // Résoudre le combat entre les deux groupes
        const battleResult = resolveMovementCollision(territory, units1, team1, units2, team2);
        
        // Envoyer l'animation de combat aux propriétaires des mouvements uniquement
        // Récupérer les ownerIds uniques des deux côtés
        const team1OwnerIds = [...new Set(byTeam[team1].map(m => m.movement.ownerId))];
        const team2OwnerIds = [...new Set(byTeam[team2].map(m => m.movement.ownerId))];
        
        // Envoyer à chaque propriétaire de mouvement
        [...team1OwnerIds, ...team2OwnerIds].forEach(ownerId => {
            const ownerSocket = io.sockets.sockets.get(ownerId);
            if (ownerSocket) {
                ownerSocket.emit('battle_start', battleResult.battleData);
            }
        });
        // Aussi aux spectateurs
        gameState.players.forEach((p, socketId) => {
            if (p.isSpectator) {
                const specSocket = io.sockets.sockets.get(socketId);
                if (specSocket) specSocket.emit('battle_start', battleResult.battleData);
            }
        });
        
        // Mettre à jour les mouvements selon le résultat
        teams.forEach(team => {
            const isWinner = battleResult.winner === team;
            byTeam[team].forEach(m => {
                m.movement.collisionHandled = true;
                
                if (isWinner) {
                    // Le gagnant continue avec les survivants
                    m.movement.units = battleResult.survivors.filter(u => u.team === team);
                    if (m.movement.units.length === 0) {
                        // Tous morts même en gagnant
                        completedMovements.push(m.index);
                        emitToTeam(m.movement.team, 'units_arrived', {
                            movementId: m.movement.id,
                            territoryId: terrId,
                            battle: true,
                            battleData: battleResult.battleData,
                            result: { success: false, allDead: true }
                        });
                    } else {
                        // Continuer le mouvement
                        const isFinal = m.movement.currentStep >= m.movement.path.length - 1;
                        if (isFinal) {
                            // Arrivée - poser les unités
                            m.movement.units.forEach(u => {
                                u.territoryId = terrId;
                                territory.units.push(u);
                            });
                            territory.owner = m.movement.ownerId;
                            territory.team = m.movement.team;
                            
                            emitToTeam(m.movement.team, 'units_arrived', {
                                movementId: m.movement.id,
                                territoryId: terrId,
                                battle: true,
                                battleData: battleResult.battleData,
                                result: { success: true, attackerWins: true }
                            });
                            completedMovements.push(m.index);
                        } else {
                            // Continuer le mouvement - calculer le temps selon le terrain du prochain territoire
                            const nextStepIndex = m.movement.currentStep + 1;
                            if (nextStepIndex < m.movement.path.length) {
                                const nextTerritoryId = m.movement.path[nextStepIndex];
                                const nextMoveTime = calculateMoveTime(nextTerritoryId, m.movement.timePerTerritory);
                                m.movement.nextArrivalTime = now + nextMoveTime;
                                m.movement.processed = false; // S'assurer qu'il sera traité au prochain cycle
                                emitToTeam(m.movement.team, 'units_progress', {
                                    movementId: m.movement.id,
                                    currentStep: m.movement.currentStep,
                                    currentTerritoryId: terrId,
                                    nextArrivalTime: m.movement.nextArrivalTime,
                                    battle: true,
                                    battleResult: 'victory',
                                    survivingUnits: m.movement.units.length
                                });
                            } else {
                                // Arrivée inattendue - poser les unités
                                m.movement.units.forEach(u => {
                                    u.territoryId = terrId;
                                    territory.units.push(u);
                                });
                                territory.owner = m.movement.ownerId;
                                territory.team = m.movement.team;
                                emitToTeam(m.movement.team, 'units_arrived', {
                                    movementId: m.movement.id,
                                    territoryId: terrId,
                                    battle: true,
                                    battleData: battleResult.battleData,
                                    result: { success: true, attackerWins: true }
                                });
                                completedMovements.push(m.index);
                            }
                        }
                    }
                } else {
                    // Le perdant perd toutes ses unités
                    completedMovements.push(m.index);
                    emitToTeam(m.movement.team, 'units_arrived', {
                        movementId: m.movement.id,
                        territoryId: terrId,
                        battle: true,
                        battleData: battleResult.battleData,
                        result: { success: false, attackerWins: false }
                    });
                }
            });
        });
        
        io.emit('territory_update', {
            id: territory.id,
            owner: territory.owner,
            team: territory.team,
            base: territory.base,
            units: territory.units,
            buildings: territory.buildings || []
        });
    });
    
    // Maintenant gérer les mouvements normaux (pas de collision)
    gameState.movingUnits.forEach((movement, index) => {
        if (!movement.processed || movement.collisionHandled) return;
        if (completedMovements.includes(index)) return;
        
        const currentTerritoryId = movement.currentTerritoryId;
        const territory = gameState.territories[currentTerritoryId];
        const isFinalDestination = movement.currentStep >= movement.path.length - 1;
        
        // Vérifier si le territoire est ennemi ou neutre (capture/combat à chaque étape)
        if (territory.team && territory.team !== movement.team) {
            // Vérifier si on peut attaquer (système guerre/paix)
            const canAttack = canAttackTerritory(movement.team, territory);
            
            if (!canAttack.allowed) {
                // Pendant la paix, on ne peut pas attaquer les territoires ennemis
                // Stopper les unités et les faire revenir ou les bloquer
                const ownerSocket = io.sockets.sockets.get(movement.ownerId);
                if (ownerSocket) {
                    ownerSocket.emit('error', { message: canAttack.reason });
                }
                
                // Les unités s'arrêtent sur le dernier territoire ami traversé
                const lastFriendlyIdx = movement.currentStep - 1;
                if (lastFriendlyIdx >= 0) {
                    const lastFriendlyId = movement.path[lastFriendlyIdx];
                    const lastFriendlyTerritory = gameState.territories[lastFriendlyId];
                    
                    movement.units.forEach(u => {
                        u.territoryId = lastFriendlyId;
                        lastFriendlyTerritory.units.push(u);
                    });
                    
                    emitToTeam(movement.team, 'units_arrived', {
                        movementId: movement.id,
                        territoryId: lastFriendlyId,
                        battle: false,
                        result: { success: false, blockedByPeace: true }
                    });
                    
                    io.emit('territory_update', {
                        id: lastFriendlyId,
                        owner: lastFriendlyTerritory.owner,
                        team: lastFriendlyTerritory.team,
                        base: lastFriendlyTerritory.base,
                        units: lastFriendlyTerritory.units,
                        buildings: lastFriendlyTerritory.buildings || []
                    });
                }
                
                completedMovements.push(index);
                return;
            }
            
            // COMBAT! (territoire ennemi - autorisé)
            const { battleData, result, survivingUnits } = resolveBattleDetailed(territory, movement.units, movement.ownerId, movement.team);
            
            // Envoyer les données de combat - uniquement au joueur attaquant et à l'équipe défenseur
            emitToBattleParticipants(movement.ownerId, territory.team || movement.team, 'battle_start', battleData);
            
            // Si les attaquants ont gagné et ce n'est pas la destination finale, continuer
            if (result.attackerWins && !isFinalDestination) {
                // Mettre à jour les unités survivantes pour continuer le trajet
                // Les unités survivantes ne restent PAS sur le territoire, elles continuent
                movement.units = survivingUnits.map(u => ({
                    ...u,
                    territoryId: null // En mouvement, pas sur un territoire
                }));
                
                // Le territoire est maintenant capturé mais VIDE (les troupes continuent)
                territory.units = [];
                
                if (movement.units.length > 0) {
                    // Vérifier qu'il y a bien une prochaine étape
                    const nextStepIndex = movement.currentStep + 1;
                    if (nextStepIndex >= movement.path.length) {
                        // Pas de prochaine étape, c'est en fait la destination finale
                        movement.units.forEach(u => {
                            u.territoryId = currentTerritoryId;
                            territory.units.push(u);
                        });
                        emitToTeam(movement.team, 'units_arrived', {
                            movementId: movement.id,
                            territoryId: currentTerritoryId,
                            battle: true,
                            battleData: battleData,
                            result: { success: true, attackerWins: true }
                        });
                        completedMovements.push(index);
                    } else {
                        // Continuer le mouvement avec les survivants - calculer temps selon terrain
                        const nextTerritoryId = movement.path[nextStepIndex];
                        const nextMoveTime = calculateMoveTime(nextTerritoryId, movement.timePerTerritory);
                        movement.nextArrivalTime = now + nextMoveTime;
                        // S'assurer que le mouvement sera traité au prochain cycle
                        movement.processed = false;
                    
                        emitToTeam(movement.team, 'units_progress', {
                            movementId: movement.id,
                            currentStep: movement.currentStep,
                            currentTerritoryId: currentTerritoryId,
                            nextArrivalTime: movement.nextArrivalTime,
                            battle: true,
                            battleResult: 'victory',
                            survivingUnits: movement.units.length
                        });
                    }
                } else {
                    // Toutes les unités sont mortes
                    emitToTeam(movement.team, 'units_arrived', {
                        movementId: movement.id,
                        territoryId: currentTerritoryId,
                        battle: true,
                        battleData: battleData,
                        result: { success: false, allDead: true }
                    });
                    completedMovements.push(index);
                }
            } else if (result.attackerWins && isFinalDestination) {
                // Victoire à destination finale - les unités restent sur le territoire
                territory.units = survivingUnits.map(u => ({
                    ...u,
                    territoryId: currentTerritoryId
                }));
                
                emitToTeam(movement.team, 'units_arrived', {
                    movementId: movement.id,
                    territoryId: currentTerritoryId,
                    battle: true,
                    battleData: battleData,
                    result: result
                });
                completedMovements.push(index);
            } else {
                // Défaite - les attaquants sont repoussés (ils meurent)
                emitToTeam(movement.team, 'units_arrived', {
                    movementId: movement.id,
                    territoryId: currentTerritoryId,
                    battle: true,
                    battleData: battleData,
                    result: result
                });
                completedMovements.push(index);
            }
            
            io.emit('territory_update', {
                id: territory.id,
                owner: territory.owner,
                team: territory.team,
                base: territory.base,
                units: territory.units,
                buildings: territory.buildings || []
            });
            
        } else if (!territory.team) {
            // CAPTURE territoire neutre
            const previousTeam = territory.team;
            territory.owner = movement.ownerId;
            territory.team = movement.team;
            gameState.teams[movement.team].territories++;
            
            // Log pour les captures IA
            if (movement.isAI) {
                const aiPlayer = gameState.aiPlayers.get(movement.ownerId);
                if (aiPlayer) {
                    console.log(`🏴 ${aiPlayer.name} a CAPTURÉ ${territory.name}!`);
                }
            }
            
            io.emit('territory_update', {
                id: territory.id,
                owner: territory.owner,
                team: territory.team,
                base: territory.base,
                units: territory.units,
                buildings: territory.buildings || []
            });
            
            if (isFinalDestination) {
                // Arrivée finale - poser les unités
                movement.units.forEach(u => {
                    u.territoryId = currentTerritoryId;
                    territory.units.push(u);
                });
                
                emitToTeam(movement.team, 'units_arrived', {
                    movementId: movement.id,
                    territoryId: currentTerritoryId,
                    battle: false,
                    captured: true
                });
                
                io.emit('territory_update', {
                    id: territory.id,
                    owner: territory.owner,
                    team: territory.team,
                    base: territory.base,
                    units: territory.units,
                    buildings: territory.buildings || []
                });
                
                completedMovements.push(index);
            } else {
                // Continuer le mouvement - calculer temps selon terrain du prochain territoire
                const nextStepIndex = movement.currentStep + 1;
                if (nextStepIndex < movement.path.length) {
                    const nextTerritoryId = movement.path[nextStepIndex];
                    const nextMoveTime = calculateMoveTime(nextTerritoryId, movement.timePerTerritory);
                    movement.nextArrivalTime = now + nextMoveTime;
                    movement.processed = false; // S'assurer qu'il sera traité au prochain cycle
                    
                    emitToTeam(movement.team, 'units_progress', {
                        movementId: movement.id,
                        currentStep: movement.currentStep,
                        currentTerritoryId: currentTerritoryId,
                        nextArrivalTime: movement.nextArrivalTime,
                        captured: true
                    });
                } else {
                    // Arrivée finale inattendue - poser les unités
                    movement.units.forEach(u => {
                        u.territoryId = currentTerritoryId;
                        territory.units.push(u);
                    });
                    emitToTeam(movement.team, 'units_arrived', {
                        movementId: movement.id,
                        territoryId: currentTerritoryId,
                        battle: false,
                        captured: true
                    });
                    io.emit('territory_update', {
                        id: territory.id,
                        owner: territory.owner,
                        team: territory.team,
                        base: territory.base,
                        units: territory.units,
                        buildings: territory.buildings || []
                    });
                    completedMovements.push(index);
                }
            }
            
        } else {
            // Territoire allié - juste passer
            if (isFinalDestination) {
                // Arrivée finale - poser les unités
                movement.units.forEach(u => {
                    u.territoryId = currentTerritoryId;
                    territory.units.push(u);
                });
                
                emitToTeam(movement.team, 'units_arrived', {
                    movementId: movement.id,
                    territoryId: currentTerritoryId,
                    battle: false
                });
                
                io.emit('territory_update', {
                    id: territory.id,
                    owner: territory.owner,
                    team: territory.team,
                    base: territory.base,
                    units: territory.units,
                    buildings: territory.buildings || []
                });
                
                completedMovements.push(index);
            } else {
                // Étape intermédiaire - continuer avec temps selon terrain
                const nextStepIndex = movement.currentStep + 1;
                if (nextStepIndex < movement.path.length) {
                    const nextTerritoryId = movement.path[nextStepIndex];
                    const nextMoveTime = calculateMoveTime(nextTerritoryId, movement.timePerTerritory);
                    movement.nextArrivalTime = now + nextMoveTime;
                    movement.processed = false; // S'assurer qu'il sera traité au prochain cycle
                    
                    emitToTeam(movement.team, 'units_progress', {
                        movementId: movement.id,
                        currentStep: movement.currentStep,
                        currentTerritoryId: currentTerritoryId,
                        nextArrivalTime: movement.nextArrivalTime
                    });
                } else {
                    // Arrivée finale inattendue - poser les unités
                    movement.units.forEach(u => {
                        u.territoryId = currentTerritoryId;
                        territory.units.push(u);
                    });
                    emitToTeam(movement.team, 'units_arrived', {
                        movementId: movement.id,
                        territoryId: currentTerritoryId,
                        battle: false
                    });
                    io.emit('territory_update', {
                        id: territory.id,
                        owner: territory.owner,
                        team: territory.team,
                        base: territory.base,
                        units: territory.units,
                        buildings: territory.buildings || []
                    });
                    completedMovements.push(index);
                }
            }
        }
        
        // Mise à jour des scores d'équipes après chaque action
        io.emit('teams_update', getTeamsData());
    });
    
    // Réinitialiser les flags pour le prochain cycle
    gameState.movingUnits.forEach(movement => {
        movement.processed = false;
        movement.collisionHandled = false;
    });
    
    // Retirer les mouvements terminés (en ordre inverse pour éviter les problèmes d'index)
    // Créer un Set pour éviter les doublons
    const uniqueCompletedMovements = [...new Set(completedMovements)];
    uniqueCompletedMovements.sort((a, b) => b - a).forEach(index => {
        gameState.movingUnits.splice(index, 1);
    });
}, 500); // Vérifier toutes les 500ms

// ==================== SAUVEGARDE AUTO ====================
setInterval(() => {
    if (gameState.players.size > 0) {
        saveGame();
    }
}, 60000);

// ==================== CYCLE DE MÉTÉO ====================
setInterval(() => {
    const now = Date.now();
    if (now >= gameState.weather.nextChange) {
        // Changer la météo
        const weatherTypes = CONFIG.WEATHER.types;
        let newWeather;
        do {
            newWeather = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
        } while (newWeather === gameState.weather.current);
        
        gameState.weather.current = newWeather;
        gameState.weather.nextChange = now + CONFIG.WEATHER.duration;
        
        const weatherEffect = CONFIG.WEATHER.effects[newWeather];
        console.log(`🌤️ Météo: ${weatherEffect.name}`);
        
        // Notifier tous les joueurs
        io.emit('weather_change', {
            weather: newWeather,
            effect: weatherEffect,
            nextChange: gameState.weather.nextChange
        });
    }
}, 5000); // Vérifier toutes les 5 secondes

// ==================== CYCLE DE SOINS (Hôpitaux) ====================
setInterval(() => {
    healUnitsInHospitals();
}, CONFIG.RESOURCE_TICK);

// ==================== CYCLE DE LEADERBOARD ====================
setInterval(() => {
    broadcastLeaderboard();
}, 10000); // Toutes les 10 secondes

// ==================== BOUCLE IA ====================
setInterval(() => {
    updateAllAI();
}, 2000); // Toutes les 2 secondes

// Mise à jour de tous les joueurs IA
function updateAllAI() {
    const now = Date.now();
    const isWar = gameState.warPeace.isWar;
    
    gameState.aiPlayers.forEach((ai, aiId) => {
        // Vérifier le cooldown
        if (now - ai.lastAction < ai.actionCooldown) return;
        
        // Si l'IA n'a pas de base, essayer d'en placer une
        if (!ai.hasBase) {
            if (placeAIBase(ai)) {
                ai.lastAction = now;
                return;
            }
        }
        
        // Mettre à jour les ressources
        updatePlayerResources(ai);
        
        // Décider de l'action selon le style
        const action = decideAIAction(ai, isWar);
        
        if (action) {
            executeAIAction(ai, action);
            ai.lastAction = now;
            // Varier le cooldown
            ai.actionCooldown = 3000 + Math.random() * 4000;
        }
    });
}

// Décider quelle action l'IA doit faire
function decideAIAction(ai, isWar) {
    const style = ai.styleConfig;
    
    // Compter les unités de l'IA et les builders
    let aiUnitCount = 0;
    let aiUnits = [];
    let aiBuilders = [];
    let aiTerritories = [];
    
    gameState.territories.forEach(t => {
        if (t.owner === ai.oderId) {
            aiTerritories.push(t);
        }
        if (t.units) {
            t.units.forEach(u => {
                if (u.ownerId === ai.oderId) {
                    aiUnitCount++;
                    aiUnits.push({ unit: u, territoryId: t.id });
                    if (u.type === 'builder' && !u.isBuilding) {
                        aiBuilders.push({ unit: u, territoryId: t.id });
                    }
                }
            });
        }
    });
    
    // Calculer le % de ressources par rapport au max souhaité
    const maxGold = 2000;
    const maxFood = 1000;
    const resourceRatio = (ai.resources.gold / maxGold + ai.resources.food / maxFood) / 2;
    
    // Compter les technologies recherchées
    const techCount = Object.values(ai.technologies).filter(t => t).length;
    
    // Priorité 0: Rechercher une technologie si beaucoup d'or et pas toutes les techs
    if (techCount < 5 && ai.resources.gold >= 600 && Math.random() < 0.15) {
        return { type: 'research', units: aiUnits };
    }
    
    // Priorité 1: Construire si on a un builder et assez d'or
    if (aiBuilders.length > 0 && ai.resources.gold >= 800 && Math.random() < 0.3) {
        return { type: 'build', units: aiUnits, builders: aiBuilders, territories: aiTerritories };
    }
    
    // Si on a assez d'unités, prioriser l'action
    if (aiUnitCount >= style.minUnitsToAttack) {
        // Priorité 2: Attaquer si en guerre
        if (isWar && Math.random() < style.attackPriority) {
            return { type: 'attack', units: aiUnits };
        }
        
        // Priorité 3: Expansion sur territoires neutres
        if (Math.random() < style.expansionRate) {
            return { type: 'expand', units: aiUnits };
        }
    }
    
    // Priorité 4: Expansion même avec peu d'unités si territoire neutre accessible
    if (aiUnitCount >= 1 && Math.random() < 0.5) {
        return { type: 'expand', units: aiUnits };
    }
    
    // Priorité 5: Produire si on a les ressources
    if (resourceRatio >= style.resourceThreshold || aiUnitCount < 5) {
        return { type: 'produce', units: aiUnits };
    }
    
    // Priorité 6: Repositionner vers les frontières
    if (aiUnitCount > 3 && Math.random() < 0.5) {
        return { type: 'reposition', units: aiUnits };
    }
    
    // Par défaut: produire
    return { type: 'produce', units: aiUnits };
}

// Exécuter l'action décidée
function executeAIAction(ai, action) {
    switch (action.type) {
        case 'produce':
            aiProduceUnit(ai);
            break;
        case 'attack':
            aiAttack(ai, action.units);
            break;
        case 'expand':
            aiExpand(ai, action.units);
            break;
        case 'reposition':
            aiReposition(ai, action.units);
            break;
        case 'build':
            aiBuild(ai, action.builders, action.territories);
            break;
        case 'research':
            aiResearch(ai);
            break;
    }
}

// L'IA produit une unité
function aiProduceUnit(ai) {
    const style = ai.styleConfig;
    
    // Vérifier la limite d'unités
    const aiUnitCount = countPlayerUnits(ai.oderId);
    if (aiUnitCount >= CONFIG.MAX_UNITS_PER_PLAYER) {
        return; // Limite atteinte
    }
    
    // Trouver le territoire avec la base de l'IA
    const baseTerritory = gameState.territories.find(t => 
        t.base && t.base.ownerId === ai.oderId
    );
    
    if (!baseTerritory) return;
    
    // Choisir un type d'unité selon le style
    const preferredUnits = style.unitPreference;
    
    for (const unitType of preferredUnits) {
        const unitConfig = CONFIG.UNITS[unitType];
        if (!unitConfig) continue;
        
        // Limiter les éclaireurs à 2 maximum par IA
        if (unitType === 'scout') {
            const scoutCount = countPlayerUnitsByType(ai.oderId, 'scout');
            if (scoutCount >= 2) continue; // Skip scouts si on en a déjà 2
        }
        
        // Limiter les builders à 3 maximum par IA
        if (unitType === 'builder') {
            const builderCount = countPlayerUnitsByType(ai.oderId, 'builder');
            if (builderCount >= 3) continue; // Skip builders si on en a déjà 3
        }
        
        // Limiter les medics à 2 maximum par IA
        if (unitType === 'medic') {
            const medicCount = countPlayerUnitsByType(ai.oderId, 'medic');
            if (medicCount >= 2) continue; // Skip medics si on en a déjà 2
        }
        
        const goldCost = unitConfig.cost?.gold || unitConfig.cost || 0;
        const foodCost = unitConfig.cost?.food || 0;
        
        if (ai.resources.gold >= goldCost && ai.resources.food >= foodCost) {
            // Créer l'unité
            const newUnit = {
                id: `unit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: unitType,
                ownerId: ai.oderId,
                team: ai.team,
                health: unitConfig.health,
                maxHealth: unitConfig.health,
                attack: unitConfig.attack,
                defense: unitConfig.defense,
                speed: unitConfig.speed
            };
            
            if (!baseTerritory.units) baseTerritory.units = [];
            baseTerritory.units.push(newUnit);
            
            ai.resources.gold -= goldCost;
            ai.resources.food -= foodCost;
            
            // Émettre la mise à jour
            io.emit('territory_update', {
                id: baseTerritory.id,
                owner: baseTerritory.owner,
                team: baseTerritory.team,
                base: baseTerritory.base,
                units: baseTerritory.units,
                buildings: baseTerritory.buildings || []
            });
            
            console.log(`🤖 ${ai.name} produit un ${unitConfig.name} (💰${ai.resources.gold} 🍖${ai.resources.food})`);
            return;
        }
    }
    
    // Pas assez de ressources pour produire
    // console.log(`💸 ${ai.name} n'a pas assez de ressources (💰${ai.resources.gold} 🍖${ai.resources.food})`);
}

// L'IA attaque un territoire ennemi
function aiAttack(ai, aiUnits) {
    if (aiUnits.length < ai.styleConfig.minUnitsToAttack) return;
    
    // Grouper les unités par territoire
    const unitsByTerritory = {};
    aiUnits.forEach(({ unit, territoryId }) => {
        if (!unitsByTerritory[territoryId]) unitsByTerritory[territoryId] = [];
        unitsByTerritory[territoryId].push(unit);
    });
    
    // Trouver un territoire avec assez d'unités pour attaquer
    for (const [territoryIdStr, units] of Object.entries(unitsByTerritory)) {
        const territoryId = parseInt(territoryIdStr);
        if (units.length < 2) continue;
        
        const territory = gameState.territories[territoryId];
        if (!territory) continue;
        
        // Trouver un voisin ennemi à attaquer
        const enemyNeighbors = territory.neighbors.filter(nId => {
            const neighbor = gameState.territories[nId];
            return neighbor && neighbor.team && neighbor.team !== ai.team;
        });
        
        if (enemyNeighbors.length > 0) {
            const targetId = enemyNeighbors[Math.floor(Math.random() * enemyNeighbors.length)];
            const targetTerritory = gameState.territories[targetId];
            
            // Calculer la force ennemie
            const enemyUnits = targetTerritory.units ? targetTerritory.units.length : 0;
            const hasEnemyBase = targetTerritory.base ? 1 : 0;
            
            // N'attaquer que si on a un avantage
            if (units.length > enemyUnits + hasEnemyBase * 2) {
                // Déplacer toutes les unités vers le territoire ennemi
                const unitsToMove = units.slice(0, Math.max(2, units.length - 1));
                
                console.log(`⚔️ ${ai.name} attaque ${targetTerritory.name} avec ${unitsToMove.length} unités!`);
                aiMoveUnits(ai, territory, targetTerritory, unitsToMove);
                return;
            }
        }
    }
}

// L'IA s'étend sur des territoires neutres
function aiExpand(ai, aiUnits) {
    // Grouper les unités par territoire
    const unitsByTerritory = {};
    aiUnits.forEach(({ unit, territoryId }) => {
        if (!unitsByTerritory[territoryId]) unitsByTerritory[territoryId] = [];
        unitsByTerritory[territoryId].push(unit);
    });
    
    for (const [territoryIdStr, units] of Object.entries(unitsByTerritory)) {
        const territoryId = parseInt(territoryIdStr);
        if (units.length < 1) continue;
        
        const territory = gameState.territories[territoryId];
        if (!territory) continue;
        
        // Trouver un voisin neutre
        const neutralNeighbors = territory.neighbors.filter(nId => {
            const neighbor = gameState.territories[nId];
            return neighbor && !neighbor.team;
        });
        
        if (neutralNeighbors.length > 0) {
            const targetId = neutralNeighbors[Math.floor(Math.random() * neutralNeighbors.length)];
            const targetTerritory = gameState.territories[targetId];
            
            const unitToMove = [units[0]];
            console.log(`🚶 ${ai.name} envoie 1 unité conquérir ${targetTerritory.name}`);
            aiMoveUnits(ai, territory, targetTerritory, unitToMove);
            return;
        }
    }
}

// L'IA repositionne ses unités
function aiReposition(ai, aiUnits) {
    // Trouver le territoire de la base
    const baseTerritory = gameState.territories.find(t => 
        t.base && t.base.ownerId === ai.oderId
    );
    
    if (!baseTerritory) return;
    
    // Grouper les unités par territoire
    const unitsByTerritory = {};
    aiUnits.forEach(({ unit, territoryId }) => {
        if (!unitsByTerritory[territoryId]) unitsByTerritory[territoryId] = [];
        unitsByTerritory[territoryId].push(unit);
    });
    
    // Déplacer des unités de la base vers les frontières
    const baseUnits = unitsByTerritory[baseTerritory.id] || [];
    
    if (baseUnits.length > 3) {
        // Trouver un territoire allié près des frontières
        const frontierTerritories = gameState.territories.filter(t => {
            if (t.team !== ai.team) return false;
            return t.neighbors.some(nId => {
                const neighbor = gameState.territories[nId];
                return neighbor && neighbor.team && neighbor.team !== ai.team;
            });
        });
        
        if (frontierTerritories.length > 0) {
            const target = frontierTerritories[Math.floor(Math.random() * frontierTerritories.length)];
            const unitsToMove = baseUnits.slice(0, 2);
            
            // Trouver un chemin
            const path = findPathBFS(baseTerritory.id, target.id, ai.team);
            if (path && path.length > 1) {
                aiMoveUnits(ai, baseTerritory, gameState.territories[path[1]], unitsToMove);
            }
        }
    }
}

// Déplacer des unités IA
function aiMoveUnits(ai, fromTerritory, toTerritory, units) {
    if (!fromTerritory || !toTerritory || units.length === 0) return;
    
    // Calculer le temps de déplacement - utiliser le même système que les humains
    // Calculer le temps de marche basé sur l'unité la plus lente
    let slowestMarchTime = 0;
    units.forEach(u => {
        const unitConfig = CONFIG.UNITS[u.type];
        if (unitConfig && unitConfig.marchTime > slowestMarchTime) {
            slowestMarchTime = unitConfig.marchTime;
        }
    });
    
    // Temps par défaut si marchTime non défini
    if (slowestMarchTime === 0) slowestMarchTime = 3000;
    
    // Appliquer effet météo et multiplicateur guerre/paix
    const weatherEffect = CONFIG.WEATHER.effects[gameState.weather.current] || { speedMod: 1 };
    const warPeaceMultiplier = gameState.warPeace.isWar 
        ? CONFIG.WAR_PEACE.warSpeedMultiplier 
        : CONFIG.WAR_PEACE.peaceSpeedMultiplier;
    const timePerTerritory = Math.round(slowestMarchTime / (weatherEffect.speedMod * warPeaceMultiplier));
    
    const unitIds = units.map(u => u.id);
    
    // Retirer les unités du territoire d'origine
    fromTerritory.units = fromTerritory.units.filter(u => !unitIds.includes(u.id));
    
    // Construire le chemin complet
    const path = [fromTerritory.id, toTerritory.id];
    
    // Créer le mouvement - MÊME FORMAT que les humains!
    const movementId = Date.now() + Math.random();
    const movement = {
        id: movementId,
        units: units,
        ownerId: ai.oderId,  // Même nom que humains
        team: ai.team,
        path: path,
        currentStep: 0,  // Même nom que humains
        startTime: Date.now(),
        timePerTerritory: timePerTerritory,  // Même nom que humains
        nextArrivalTime: Date.now() + timePerTerritory,  // Même nom que humains
        isAI: true
    };
    
    gameState.movingUnits.push(movement);
    
    // Émettre les mises à jour
    io.emit('territory_update', {
        id: fromTerritory.id,
        owner: fromTerritory.owner,
        team: fromTerritory.team,
        base: fromTerritory.base,
        units: fromTerritory.units,
        buildings: fromTerritory.buildings || []
    });
    
    // Utiliser le même event que les humains - seulement pour l'équipe
    emitToTeam(ai.team, 'units_marching', {
        movementId: movementId,
        units: units.map(u => ({ id: u.id, type: u.type, team: u.team })),
        path: path,
        startTime: movement.startTime,
        timePerTerritory: timePerTerritory,
        totalTime: timePerTerritory * (path.length - 1),
        team: ai.team
    });
}

// L'IA construit un bâtiment
function aiBuild(ai, builders, territories) {
    if (builders.length === 0) return;
    
    // Choisir un builder au hasard
    const builderData = builders[Math.floor(Math.random() * builders.length)];
    const builder = builderData.unit;
    const territory = gameState.territories[builderData.territoryId];
    
    if (!territory || territory.team !== ai.team) return;
    
    // Choisir le type de bâtiment selon le style et les besoins
    const style = ai.styleConfig;
    let buildingType = null;
    
    // Compter les bâtiments existants de l'IA
    let mineCount = 0;
    let farmCount = 0;
    let towerCount = 0;
    let barracksCount = 0;
    
    territories.forEach(t => {
        if (t.buildings) {
            t.buildings.forEach(b => {
                if (b.ownerId === ai.oderId) {
                    if (b.type === 'mine') mineCount++;
                    if (b.type === 'farm') farmCount++;
                    if (b.type === 'tower') towerCount++;
                    if (b.type === 'barracks') barracksCount++;
                }
            });
        }
    });
    
    // Logique de choix selon le style
    if (style.name === 'Économique' || style.name === 'Turtle') {
        // Priorité économie
        if (mineCount < 3 && ai.resources.gold >= 700) buildingType = 'mine';
        else if (farmCount < 3 && ai.resources.gold >= 500) buildingType = 'farm';
        else if (towerCount < 2 && ai.resources.gold >= 800) buildingType = 'tower';
    } else if (style.name === 'Défensif') {
        // Priorité défense
        if (towerCount < 4 && ai.resources.gold >= 800) buildingType = 'tower';
        else if (farmCount < 2 && ai.resources.gold >= 500) buildingType = 'farm';
        else if (mineCount < 2 && ai.resources.gold >= 700) buildingType = 'mine';
    } else {
        // Style agressif/équilibré - mélange
        const roll = Math.random();
        if (roll < 0.4 && mineCount < 2 && ai.resources.gold >= 700) buildingType = 'mine';
        else if (roll < 0.7 && farmCount < 2 && ai.resources.gold >= 500) buildingType = 'farm';
        else if (towerCount < 3 && ai.resources.gold >= 800) buildingType = 'tower';
    }
    
    if (!buildingType) return;
    
    const buildingConfig = CONFIG.BUILDINGS[buildingType];
    if (!buildingConfig || ai.resources.gold < buildingConfig.cost.gold) return;
    
    // Vérifier qu'il n'y a pas déjà ce type de bâtiment sur ce territoire
    territory.buildings = territory.buildings || [];
    if (territory.buildings.some(b => b.type === buildingType)) return;
    
    // Déduire les ressources
    ai.resources.gold -= buildingConfig.cost.gold;
    
    // Marquer le builder comme occupé
    builder.isBuilding = true;
    builder.buildingEndTime = Date.now() + buildingConfig.buildTime;
    
    console.log(`🏗️ ${ai.name} commence la construction d'un ${buildingConfig.name} sur ${territory.name}`);
    
    // Programmer la fin de construction
    setTimeout(() => {
        const buildTerritory = gameState.territories[builderData.territoryId];
        if (!buildTerritory || buildTerritory.team !== ai.team) return;
        
        // Vérifier que le builder est toujours là
        const builderStillHere = buildTerritory.units.find(u => u.id === builder.id);
        if (!builderStillHere) return;
        
        // Créer le bâtiment
        const newBuilding = {
            id: `building_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: buildingType,
            ownerId: ai.oderId,
            team: ai.team,
            health: buildingConfig.health,
            maxHealth: buildingConfig.health
        };
        
        buildTerritory.buildings.push(newBuilding);
        builderStillHere.isBuilding = false;
        builderStillHere.buildingEndTime = null;
        
        console.log(`🏛️ ${ai.name} a terminé la construction d'un ${buildingConfig.name}!`);
        
        // Notifier tout le monde
        io.emit('territory_update', {
            id: buildTerritory.id,
            owner: buildTerritory.owner,
            team: buildTerritory.team,
            base: buildTerritory.base,
            units: buildTerritory.units,
            buildings: buildTerritory.buildings
        });
    }, buildingConfig.buildTime);
}

// L'IA recherche une technologie
function aiResearch(ai) {
    const techCosts = {
        improvedAttack: { gold: 500, food: 100 },
        improvedDefense: { gold: 500, food: 100 },
        improvedSpeed: { gold: 400, food: 150 },
        improvedVision: { gold: 300, food: 50 },
        improvedHeal: { gold: 350, food: 80 }
    };
    
    // Trouver une technologie non recherchée qu'on peut se permettre
    const style = ai.styleConfig;
    
    // Priorité selon le style
    let techPriority = [];
    if (style.name === 'Agressif' || style.name === 'Rusher') {
        techPriority = ['improvedAttack', 'improvedSpeed', 'improvedDefense', 'improvedVision', 'improvedHeal'];
    } else if (style.name === 'Défensif' || style.name === 'Turtle') {
        techPriority = ['improvedDefense', 'improvedHeal', 'improvedVision', 'improvedAttack', 'improvedSpeed'];
    } else if (style.name === 'Technicien') {
        techPriority = ['improvedVision', 'improvedSpeed', 'improvedAttack', 'improvedDefense', 'improvedHeal'];
    } else {
        // Équilibré et autres
        techPriority = ['improvedDefense', 'improvedAttack', 'improvedSpeed', 'improvedHeal', 'improvedVision'];
    }
    
    for (const techName of techPriority) {
        if (ai.technologies[techName]) continue;
        
        const cost = techCosts[techName];
        if (ai.resources.gold >= cost.gold && ai.resources.food >= cost.food) {
            ai.resources.gold -= cost.gold;
            ai.resources.food -= cost.food;
            ai.technologies[techName] = true;
            
            const techNames = {
                improvedAttack: 'Attaque Améliorée',
                improvedDefense: 'Défense Améliorée', 
                improvedSpeed: 'Vitesse Améliorée',
                improvedVision: 'Vision Améliorée',
                improvedHeal: 'Soin Amélioré'
            };
            
            console.log(`🔬 ${ai.name} a recherché: ${techNames[techName]}`);
            return;
        }
    }
}

// Trouver un chemin (BFS simplifié)
function findPathBFS(fromId, toId, team) {
    const visited = new Set();
    const queue = [[fromId]];
    
    while (queue.length > 0) {
        const path = queue.shift();
        const current = path[path.length - 1];
        
        if (current === toId) return path;
        
        if (visited.has(current)) continue;
        visited.add(current);
        
        const territory = gameState.territories[current];
        if (!territory) continue;
        
        for (const neighborId of territory.neighbors) {
            if (visited.has(neighborId)) continue;
            
            const neighbor = gameState.territories[neighborId];
            // Peut traverser: son équipe ou neutre
            if (neighbor && (!neighbor.team || neighbor.team === team)) {
                queue.push([...path, neighborId]);
            }
        }
    }
    
    return null;
}

function broadcastLeaderboard() {
    const players = [];
    
    gameState.players.forEach((player, oderId) => {
        // Compter les territoires de ce joueur
        let territoryCount = 0;
        let unitCount = 0;
        let buildingCount = 0;
        
        gameState.territories.forEach(t => {
            // Compter les territoires avec base du joueur
            if (t.base && t.base.playerId === oderId) {
                territoryCount++;
            }
            // Compter les unités du joueur
            if (t.units) {
                t.units.forEach(u => {
                    if (u.ownerId === oderId) {
                        unitCount++;
                    }
                });
            }
            // Compter les bâtiments du joueur
            if (t.buildings) {
                t.buildings.forEach(b => {
                    if (b.ownerId === oderId) {
                        buildingCount++;
                    }
                });
            }
        });
        
        // Système de points équilibré:
        // Territoires = 2 points
        // Bâtiments = 1 point chacun
        // Unités = 0.2 point par unité
        // Kills = 1 point par kill
        const kills = player.kills || 0;
        const score = (territoryCount * 2) + (buildingCount * 1) + (unitCount * 0.2) + (kills * 1);
        
        players.push({
            id: oderId,
            name: player.name,
            team: player.team,
            territories: territoryCount,
            buildings: buildingCount,
            units: unitCount,
            kills: kills,
            score: Math.round(score * 10) / 10 // Arrondi à 1 décimale
        });
    });
    
    // Trier par score décroissant
    players.sort((a, b) => b.score - a.score);
    
    // Mettre à jour le classement global dans la base de données
    players.forEach(async (p) => {
        const player = gameState.players.get(p.id);
        if (player && player.userId) {
            try {
                await db.updateLeaderboard(player.userId, p.name, p.score);
            } catch (err) {
                // Ignorer les erreurs
            }
        }
    });
    
    io.emit('leaderboard_update', players);
}

// ==================== SAUVEGARDE JOUEUR EN BASE ====================
async function savePlayerToDatabase(userId, player) {
    if (!userId) return;
    
    try {
        // Sauvegarder les données de jeu principales
        await db.savePlayerGameData(userId, {
            team: player.team,
            gold: player.resources.gold,
            food: player.resources.food,
            hasBase: player.hasBase,
            baseTerritoryId: player.baseTerritory,
            kills: player.kills || 0,
            technologies: player.technologies
        });
        
        // Collecter les unités du joueur
        const playerUnits = [];
        gameState.territories.forEach(t => {
            if (t.units) {
                t.units.forEach(u => {
                    if (u.ownerId === player.oderId) {
                        playerUnits.push({
                            id: u.id,
                            type: u.type,
                            health: u.health,
                            territoryId: t.id
                        });
                    }
                });
            }
        });
        await db.savePlayerUnits(userId, playerUnits);
        
        // Collecter les bâtiments du joueur
        const playerBuildings = [];
        gameState.territories.forEach(t => {
            if (t.buildings) {
                t.buildings.forEach(b => {
                    if (b.ownerId === player.oderId) {
                        playerBuildings.push({
                            id: b.id,
                            type: b.type,
                            territoryId: t.id,
                            health: b.health
                        });
                    }
                });
            }
        });
        await db.savePlayerBuildings(userId, playerBuildings);
        
    } catch (err) {
        console.error('Erreur sauvegarde DB:', err);
    }
}

// ==================== DÉMARRAGE ====================
async function startServer() {
    // Initialiser la base de données
    try {
        await db.init();
        console.log('✅ Base de données initialisée');
        
        // Nettoyer les sessions expirées
        await db.cleanExpiredSessions();
    } catch (err) {
        console.error('❌ Erreur initialisation DB:', err);
    }
    
    // Essayer de charger une partie sauvegardée, sinon nouvelle partie
    const loaded = await loadGame();
    if (!loaded) {
        console.log('🔄 Aucune sauvegarde trouvée - Nouvelle partie...');
        initNewGame();
        // Sauvegarder la nouvelle partie dans la DB
        await saveGame();
    }
    
    // Initialiser les joueurs IA
    setTimeout(() => {
        initializeAIPlayers();
    }, 1000);

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     ⚔️  WAR TERRITORY - Serveur Global RTS  ⚔️                ║
║                                                               ║
║     🌐 Serveur démarré sur le port ${PORT}                      ║
║     📍 http://localhost:${PORT}                                 ║
║     🗺️  Map Seed: ${gameState.mapSeed}                              ║
║     🔐 Authentification: Activée                              ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
        `);
    });
}

// Démarrer le serveur
startServer();

module.exports = { app, server, io };
