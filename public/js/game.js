/**
 * WAR TERRITORY - Module de Jeu Principal
 * Gère la logique du jeu et coordonne tous les modules
 */

const Game = {
    // État du jeu
    state: {
        roomCode: null,
        mapSeed: null,
        territories: [],
        players: [],
        myId: null,
        myName: null,
        myTeam: null,
        selectedTerritoryId: null,
        isHost: false
    },
    
    /**
     * Initialise le jeu au chargement de la page
     */
    init: function() {
        console.log('🎮 Initialisation de War Territory...');
        
        // Initialiser le réseau
        Network.init();
        
        // Listeners pour les inputs
        document.getElementById('player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        
        document.getElementById('room-code').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChat();
        });
    },
    
    /**
     * Rejoindre ou créer une room
     */
    joinRoom: function() {
        const nameInput = document.getElementById('player-name');
        const codeInput = document.getElementById('room-code');
        
        const name = nameInput.value.trim() || 'Commandant';
        const code = codeInput.value.trim().toUpperCase();
        
        this.state.myName = name;
        
        if (Network.joinRoom(code, name)) {
            UI.updateConnectionStatus('connected', 'Connexion à la partie...');
        }
    },
    
    /**
     * Callback: Room rejointe avec succès
     */
    onRoomJoined: function(data) {
        console.log('🏰 Données de room reçues:', data);
        
        this.state.roomCode = data.roomCode;
        this.state.mapSeed = data.mapSeed;
        this.state.isHost = data.isHost;
        this.state.myId = Network.socket.id;
        this.state.players = data.players;
        
        // Afficher l'écran de jeu
        UI.showGameScreen();
        UI.updateRoomCode(data.roomCode);
        
        // Générer la carte localement avec le même seed
        UI.updateLoadingDetail('Génération de la carte...');
        
        setTimeout(() => {
            // Utiliser les territoires du serveur (avec les données de jeu)
            // mais générer les vertices localement avec le seed
            this.generateMapFromSeed(data.mapSeed, data.territories);
        }, 100);
    },
    
    /**
     * Génère la carte à partir du seed
     */
    generateMapFromSeed: function(seed, serverTerritories) {
        // Générer la géométrie locale
        const localTerritories = MapGenerator.generateMap(seed, (progress) => {
            UI.updateLoadingDetail(progress);
        });
        
        // Fusionner avec les données du serveur (owner, troops)
        this.state.territories = localTerritories.map((local, index) => {
            const server = serverTerritories[index];
            return {
                ...local,
                owner: server ? server.owner : local.owner,
                troops: server ? server.troops : local.troops
            };
        });
        
        // Initialiser le rendu
        MapRenderer.init();
        MapRenderer.renderMap(this.state.territories);
        
        // Mettre à jour l'UI
        this.updateScores();
        UI.updatePlayersList(this.state.players, this.state.myId);
        UI.hideLoading();
        
        // Notifier
        UI.showNotification('Bienvenue!', `Partie ${this.state.roomCode} - Choisissez votre faction`, 'success');
    },
    
    /**
     * Callback: Nouveau joueur rejoint
     */
    onPlayerJoined: function(player) {
        this.state.players.push(player);
        UI.updatePlayersList(this.state.players, this.state.myId);
        UI.showNotification('Nouveau joueur', `${player.name} a rejoint la partie`, 'info');
    },
    
    /**
     * Callback: Joueur parti
     */
    onPlayerLeft: function(playerId) {
        this.state.players = this.state.players.filter(p => p.id !== playerId);
        UI.updatePlayersList(this.state.players, this.state.myId);
    },
    
    /**
     * Callback: Mise à jour des joueurs
     */
    onPlayersUpdate: function(players) {
        this.state.players = players;
        UI.updatePlayersList(players, this.state.myId);
        
        // Mettre à jour les boutons d'équipe
        const takenTeams = players.filter(p => p.team && p.id !== this.state.myId).map(p => p.team);
        UI.updateTeamButtons(this.state.myTeam, takenTeams);
    },
    
    /**
     * Callback: Changement d'équipe d'un joueur
     */
    onPlayerTeamChanged: function(data) {
        const player = this.state.players.find(p => p.id === data.playerId);
        if (player) {
            player.team = data.team;
            UI.updatePlayersList(this.state.players, this.state.myId);
        }
    },
    
    /**
     * Callback: Mise à jour des territoires
     */
    onTerritoriesUpdate: function(serverTerritories) {
        // Mettre à jour les données de jeu (owner, troops) en gardant la géométrie locale
        serverTerritories.forEach((server, index) => {
            if (this.state.territories[index]) {
                this.state.territories[index].owner = server.owner;
                this.state.territories[index].troops = server.troops;
            }
        });
        
        // Re-render
        MapRenderer.renderMap(this.state.territories);
        this.updateScores();
        
        // Mettre à jour le panneau d'info si un territoire est sélectionné
        if (this.state.selectedTerritoryId !== null) {
            this.updateTerritoryInfo();
        }
    },
    
    /**
     * Callback: Résultat de bataille
     */
    onBattleResult: function(result) {
        if (result.success) {
            UI.showNotification('⚔️ Victoire!', result.message, 'success');
        } else {
            UI.showNotification('🛡️ Défaite', result.message, 'warning');
        }
    },
    
    /**
     * Callback: Fin de partie
     */
    onGameOver: function(data) {
        UI.showVictoryModal(data.message);
    },
    
    /**
     * Sélectionne une équipe
     */
    selectTeam: function(team) {
        if (this.state.myTeam) {
            UI.showNotification('Info', 'Vous avez déjà choisi une équipe', 'warning');
            return;
        }
        
        this.state.myTeam = team;
        Network.selectTeam(team);
        
        // Centrer sur la capitale
        const capital = this.state.territories.find(t => t.isCapital && t.owner === team);
        if (capital) {
            setTimeout(() => MapRenderer.centerOn(capital), 500);
        }
        
        UI.showNotification('Faction choisie', `Vous avez rejoint ${CONFIG.TEAMS[team].name}!`, 'success');
    },
    
    /**
     * Sélectionne un territoire
     */
    selectTerritory: function(territoryId) {
        this.state.selectedTerritoryId = territoryId;
        MapRenderer.selectTerritory(territoryId);
        this.updateTerritoryInfo();
    },
    
    /**
     * Met à jour le panneau d'info du territoire sélectionné
     */
    updateTerritoryInfo: function() {
        const territoryId = this.state.selectedTerritoryId;
        
        if (territoryId === null) {
            UI.updateTerritoryInfo(null, false, false);
            return;
        }
        
        const territory = this.state.territories[territoryId];
        if (!territory) return;
        
        const canAttack = this.state.myTeam && 
                          territory.owner !== this.state.myTeam && 
                          this.isNeighborOfMyTerritory(territory);
        
        const canReinforce = territory.owner === this.state.myTeam;
        
        UI.updateTerritoryInfo(territory, canAttack, canReinforce);
    },
    
    /**
     * Vérifie si un territoire est voisin d'un de mes territoires
     */
    isNeighborOfMyTerritory: function(territory) {
        return territory.neighbors.some(nId => 
            this.state.territories[nId] && 
            this.state.territories[nId].owner === this.state.myTeam
        );
    },
    
    /**
     * Trouve mon territoire voisin avec le plus de troupes
     */
    findBestAttacker: function(targetTerritory) {
        let best = null;
        let maxTroops = 1;
        
        targetTerritory.neighbors.forEach(nId => {
            const neighbor = this.state.territories[nId];
            if (neighbor && neighbor.owner === this.state.myTeam && neighbor.troops > maxTroops) {
                best = neighbor;
                maxTroops = neighbor.troops;
            }
        });
        
        return best;
    },
    
    /**
     * Lance une attaque
     */
    attack: function() {
        const target = this.state.territories[this.state.selectedTerritoryId];
        if (!target || !this.state.myTeam) return;
        
        const attacker = this.findBestAttacker(target);
        if (!attacker || attacker.troops <= 1) {
            UI.showNotification('Impossible', 'Pas assez de troupes pour attaquer!', 'error');
            return;
        }
        
        Network.attack(attacker.id, target.id);
    },
    
    /**
     * Renforce un territoire
     */
    reinforce: function() {
        const territoryId = this.state.selectedTerritoryId;
        if (territoryId === null) return;
        
        const territory = this.state.territories[territoryId];
        if (!territory || territory.owner !== this.state.myTeam) return;
        
        Network.reinforce(territoryId);
    },
    
    /**
     * Envoie un message chat
     */
    sendChat: function() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        
        if (message) {
            Network.sendChat(message);
            input.value = '';
        }
    },
    
    /**
     * Met à jour les scores
     */
    updateScores: function() {
        const scores = { red: 0, blue: 0, green: 0, yellow: 0 };
        
        this.state.territories.forEach(t => {
            if (t.owner) scores[t.owner]++;
        });
        
        UI.updateScores(scores);
    },
    
    /**
     * Quitte la room
     */
    leaveRoom: function() {
        Network.leaveRoom();
        location.reload();
    }
};

// Initialiser au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    Game.init();
});
