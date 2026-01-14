/**
 * WAR TERRITORY - Configuration Globale
 * Constantes et paramètres du jeu
 */

const CONFIG = {
    // Dimensions de la carte
    MAP_WIDTH: 50000,
    MAP_HEIGHT: 35000,
    TERRITORY_COUNT: 1500,
    
    // Équipes
    TEAMS: {
        red: { 
            name: 'Empire Rouge', 
            fill: '#8b2020', 
            border: '#ff4444',
            icon: '🔴'
        },
        blue: { 
            name: 'Alliance Bleue', 
            fill: '#204080', 
            border: '#4488ff',
            icon: '🔵'
        },
        green: { 
            name: 'Légion Verte', 
            fill: '#208040', 
            border: '#44ff66',
            icon: '🟢'
        },
        yellow: { 
            name: 'Ordre Doré', 
            fill: '#808020', 
            border: '#ffcc00',
            icon: '🟡'
        }
    },
    
    // Paramètres de génération
    CORNER_OFFSET: 2000,
    CORNER_SPREAD: 8000,
    TEAMS_PER_CORNER: 100,
    MIN_TERRITORY_DISTANCE: 700,
    NEIGHBOR_DISTANCE: 2500,
    
    // Troupes
    CAPITAL_TROOPS: 200,
    TEAM_BASE_TROOPS: 30,
    NEUTRAL_MIN_TROOPS: 8,
    NEUTRAL_MAX_TROOPS: 28,
    REINFORCEMENT_AMOUNT: 15,
    
    // Navigation
    ZOOM_MIN: 0.05,
    ZOOM_MAX: 2,
    ZOOM_STEP: 1.2,
    DEFAULT_ZOOM: 0.3,
    
    // Noms de territoires
    TERRITORY_NAMES: [
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
        "Rivendell", "Mordheim", "Altdorf", "Marienburg", "Nuln",
        "Praag", "Kislev", "Cathay", "Nippon", "Lustria",
        "Ulthuan", "Naggaroth", "Khemri", "Nehekhara", "Ind",
        "Araby", "Bretonnia", "Estalia", "Tilea", "Border Princes",
        "Norsca", "Albion", "Skavenblight", "Karaz-a-Karak", "Karak Eight Peaks",
        "Mont Blanc", "Val Doré", "Côte Sauvage", "Mer Intérieure", "Grand Lac",
        "Forêt Noire", "Monts Gris", "Plaine Centrale", "Désert Blanc", "Toundra Gelée",
        "Îles du Crépuscule", "Baie du Dragon", "Port Royal", "Cité des Anges", "Tour de Garde",
        "Château Fort", "Bastion Nord", "Citadelle Sud", "Forteresse Est", "Rempart Ouest",
        "Terres Sauvages", "Domaine Ancien", "Nouveau Monde", "Vieux Continent", "Îles Perdues",
        "Sanctuaire", "Refuge", "Havre de Paix", "Camp Militaire", "Zone de Guerre",
        "Province Alpha", "Secteur Beta", "Région Gamma", "Zone Delta", "Territoire Omega",
        "Nexus Prime", "Vortex Central", "Portail Dimensionnel", "Faille Temporelle", "Anomalie Spatiale",
        "Colonie Nova", "Station Orbitale", "Base Lunaire", "Avant-Poste", "Quartier Général",
        "Marécages Sombres", "Vallée Oubliée", "Pics Enneigés", "Gorges Profondes", "Cavernes Ancestrales",
        "Plaines Dorées", "Steppes Infinies", "Savane Brûlante", "Jungle Dense", "Mangrove Mystique",
        "Récifs Coralliens", "Abysses Marines", "Fosses Océaniques", "Plateau Continental", "Atoll Tropical",
        "Volcan Actif", "Caldeira Géante", "Source Chaude", "Geyser Furieux", "Lave Éternelle",
        "Glacier Millénaire", "Banquise Dérivante", "Permafrost", "Aurore Boréale", "Nuit Polaire",
        "Oasis Cachée", "Mirage Doré", "Dunes Mouvantes", "Tempête de Sable", "Sphinx Gardien",
        "Pyramide Oubliée", "Temple Perdu", "Ruines Antiques", "Cité Engloutie", "Trésor Maudit",
        "Dragon's Lair", "Phoenix Nest", "Griffin Peak", "Unicorn Vale", "Hydra Swamp",
        "Kraken Depths", "Leviathan Bay", "Cerberus Gate", "Minotaur Maze", "Cyclops Island",
        "Titan's Rest", "Giant's Causeway", "Dwarf Stronghold", "Elf Sanctuary", "Orc Warcamp"
    ],
    
    // Serveur
    SERVER_URL: window.location.origin
};

// Geler la config pour éviter les modifications accidentelles
Object.freeze(CONFIG);
Object.freeze(CONFIG.TEAMS);
