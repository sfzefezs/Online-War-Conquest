/**
 * WAR TERRITORY - Module Réseau
 * Gère toutes les communications avec le serveur via Socket.io
 */

const Network = {
    socket: null,
    isConnected: false,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    
    /**
     * Initialise la connexion au serveur
     */
    init: function() {
        console.log('🔌 Connexion au serveur...');
        
        this.socket = io(CONFIG.SERVER_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 1000
        });
        
        this.setupEventListeners();
    },
    
    /**
     * Configure tous les listeners d'événements Socket.io
     */
    setupEventListeners: function() {
        // Connexion réussie
        this.socket.on('connect', () => {
            console.log('✅ Connecté au serveur');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            UI.updateConnectionStatus('connected', 'Connecté au serveur');
        });
        
        // Déconnexion
        this.socket.on('disconnect', (reason) => {
            console.log('❌ Déconnecté:', reason);
            this.isConnected = false;
            UI.updateConnectionStatus('error', 'Déconnecté du serveur');
        });
        
        // Erreur de connexion
        this.socket.on('connect_error', (error) => {
            console.error('❌ Erreur de connexion:', error);
            this.reconnectAttempts++;
            UI.updateConnectionStatus('error', `Tentative de reconnexion (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        });
        
        // Room rejointe avec succès
        this.socket.on('room_joined', (data) => {
            console.log('🏰 Room rejointe:', data.roomCode);
            Game.onRoomJoined(data);
        });
        
        // Nouveau joueur
        this.socket.on('player_joined', (player) => {
            console.log('👤 Joueur rejoint:', player.name);
            Game.onPlayerJoined(player);
        });
        
        // Joueur parti
        this.socket.on('player_left', (playerId) => {
            console.log('👤 Joueur parti:', playerId);
            Game.onPlayerLeft(playerId);
        });
        
        // Mise à jour des joueurs
        this.socket.on('players_update', (players) => {
            Game.onPlayersUpdate(players);
        });
        
        // Changement d'équipe d'un joueur
        this.socket.on('player_team_changed', (data) => {
            Game.onPlayerTeamChanged(data);
        });
        
        // Mise à jour des territoires
        this.socket.on('territories_update', (territories) => {
            Game.onTerritoriesUpdate(territories);
        });
        
        // Résultat de bataille
        this.socket.on('battle_result', (result) => {
            Game.onBattleResult(result);
        });
        
        // Message système
        this.socket.on('system_message', (data) => {
            UI.addChatMessage('Système', data.message, data.color, true);
        });
        
        // Message de chat
        this.socket.on('chat_message', (msg) => {
            const color = msg.team ? CONFIG.TEAMS[msg.team].border : '#ffffff';
            UI.addChatMessage(msg.author, msg.message, color);
        });
        
        // Erreur
        this.socket.on('error_message', (data) => {
            UI.showNotification('Erreur', data.message, 'error');
        });
        
        // Fin de partie
        this.socket.on('game_over', (data) => {
            Game.onGameOver(data);
        });
        
        // Alerte domination
        this.socket.on('domination_warning', (data) => {
            const teamName = CONFIG.TEAMS[data.team].name;
            UI.showNotification('⚠️ Domination!', `${teamName} contrôle ${data.percentage}% de la carte!`, 'warning');
        });
    },
    
    /**
     * Rejoindre une room
     */
    joinRoom: function(roomCode, playerName) {
        if (!this.isConnected) {
            UI.showNotification('Erreur', 'Non connecté au serveur', 'error');
            return false;
        }
        
        this.socket.emit('join_room', {
            roomCode: roomCode,
            playerName: playerName
        });
        
        return true;
    },
    
    /**
     * Sélectionner une équipe
     */
    selectTeam: function(team) {
        if (!this.isConnected) return;
        this.socket.emit('select_team', team);
    },
    
    /**
     * Attaquer un territoire
     */
    attack: function(attackerId, targetId) {
        if (!this.isConnected) return;
        this.socket.emit('attack', { attackerId, targetId });
    },
    
    /**
     * Renforcer un territoire
     */
    reinforce: function(territoryId) {
        if (!this.isConnected) return;
        this.socket.emit('reinforce', { territoryId });
    },
    
    /**
     * Transférer des troupes
     */
    transferTroops: function(fromId, toId, amount) {
        if (!this.isConnected) return;
        this.socket.emit('transfer_troops', { fromId, toId, amount });
    },
    
    /**
     * Envoyer un message chat
     */
    sendChat: function(message) {
        if (!this.isConnected || !message.trim()) return;
        this.socket.emit('chat_message', message.trim());
    },
    
    /**
     * Quitter la room
     */
    leaveRoom: function() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
};
