/**
 * WAR TERRITORY - Module UI
 * Gère toute l'interface utilisateur
 */

const UI = {
    /**
     * Met à jour le statut de connexion
     */
    updateConnectionStatus: function(status, text) {
        const statusEl = document.getElementById('connection-status');
        const statusText = statusEl.querySelector('.status-text');
        
        statusEl.className = 'connection-status ' + status;
        statusText.textContent = text;
        
        // Activer/désactiver le bouton
        const btnJoin = document.getElementById('btn-join');
        btnJoin.disabled = status !== 'connected';
    },
    
    /**
     * Affiche l'écran de jeu
     */
    showGameScreen: function() {
        document.getElementById('connection-screen').style.display = 'none';
        document.getElementById('game-screen').style.display = 'block';
    },
    
    /**
     * Met à jour le code de la room affiché
     */
    updateRoomCode: function(code) {
        document.getElementById('header-room-code').textContent = 'CODE: ' + code;
        document.getElementById('display-code').textContent = code;
    },
    
    /**
     * Copie le code de la room
     */
    copyRoomCode: function() {
        const code = document.getElementById('display-code').textContent;
        navigator.clipboard.writeText(code).then(() => {
            this.showNotification('Copié!', `Code ${code} copié dans le presse-papier`, 'success');
        });
    },
    
    /**
     * Met à jour les scores
     */
    updateScores: function(scores) {
        document.getElementById('score-red').textContent = scores.red || 0;
        document.getElementById('score-blue').textContent = scores.blue || 0;
        document.getElementById('score-green').textContent = scores.green || 0;
        document.getElementById('score-yellow').textContent = scores.yellow || 0;
    },
    
    /**
     * Met à jour le compteur de joueurs
     */
    updatePlayerCount: function(count) {
        document.getElementById('player-count').textContent = `👥 ${count} joueur${count > 1 ? 's' : ''}`;
    },
    
    /**
     * Met à jour la liste des joueurs
     */
    updatePlayersList: function(players, myId) {
        const container = document.getElementById('players-list');
        container.innerHTML = '';
        
        players.forEach(player => {
            const div = document.createElement('div');
            div.className = 'player-item' + (player.id === myId ? ' you' : '');
            
            const dotColor = player.team ? CONFIG.TEAMS[player.team].border : '#555555';
            
            div.innerHTML = `
                <span class="player-dot" style="background: ${dotColor}"></span>
                <span class="player-name">${player.name}</span>
                ${player.id === myId ? '<span class="player-tag">(vous)</span>' : ''}
            `;
            
            container.appendChild(div);
        });
        
        this.updatePlayerCount(players.length);
    },
    
    /**
     * Met à jour les boutons d'équipe
     */
    updateTeamButtons: function(myTeam, takenTeams) {
        document.querySelectorAll('.team-btn').forEach(btn => {
            const team = btn.dataset.team;
            btn.classList.toggle('selected', team === myTeam);
            btn.disabled = myTeam !== null || takenTeams.includes(team);
        });
    },
    
    /**
     * Met à jour le panneau d'information du territoire
     */
    updateTerritoryInfo: function(territory, canAttack, canReinforce) {
        if (!territory) {
            document.getElementById('info-name').textContent = 'Sélectionnez un territoire';
            document.getElementById('info-owner').textContent = '-';
            document.getElementById('info-troops').textContent = '-';
            document.getElementById('info-neighbors').textContent = '-';
            document.getElementById('btn-attack').disabled = true;
            document.getElementById('btn-reinforce').disabled = true;
            return;
        }
        
        const ownerName = territory.owner ? CONFIG.TEAMS[territory.owner].name : 'Neutre';
        const ownerColor = territory.owner ? CONFIG.TEAMS[territory.owner].border : '#888888';
        
        document.getElementById('info-name').textContent = territory.name;
        document.getElementById('info-owner').textContent = ownerName;
        document.getElementById('info-owner').style.color = ownerColor;
        document.getElementById('info-troops').textContent = territory.troops;
        document.getElementById('info-neighbors').textContent = territory.neighbors.length + ' territoires';
        document.getElementById('btn-attack').disabled = !canAttack;
        document.getElementById('btn-reinforce').disabled = !canReinforce;
    },
    
    /**
     * Ajoute un message au chat
     */
    addChatMessage: function(author, message, color = '#ffffff', isSystem = false) {
        const container = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = 'chat-msg' + (isSystem ? ' system' : '');
        div.innerHTML = `<span class="author" style="color: ${color}">${author}:</span> ${message}`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },
    
    /**
     * Toggle le chat
     */
    toggleChat: function() {
        const chat = document.getElementById('chat-panel');
        chat.classList.toggle('minimized');
    },
    
    /**
     * Toggle les paramètres
     */
    toggleSettings: function() {
        const modal = document.getElementById('settings-modal');
        modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
    },
    
    /**
     * Affiche le modal de victoire
     */
    showVictoryModal: function(message) {
        document.getElementById('victory-message').textContent = message;
        document.getElementById('victory-modal').style.display = 'flex';
    },
    
    /**
     * Met à jour le niveau de zoom affiché
     */
    updateZoomLevel: function(zoom) {
        document.getElementById('zoom-level').textContent = Math.round(zoom * 100) + '%';
    },
    
    /**
     * Met à jour le détail de chargement
     */
    updateLoadingDetail: function(text) {
        document.getElementById('loading-detail').textContent = text;
    },
    
    /**
     * Cache l'overlay de chargement
     */
    hideLoading: function() {
        document.getElementById('loading-overlay').classList.add('hidden');
    },
    
    /**
     * Affiche une notification
     */
    showNotification: function(title, message, type = 'info') {
        const container = document.getElementById('notifications-container');
        const notif = document.createElement('div');
        notif.className = 'notification ' + type;
        notif.innerHTML = `
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        `;
        container.appendChild(notif);
        
        // Auto-suppression après 5 secondes
        setTimeout(() => {
            notif.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => notif.remove(), 300);
        }, 5000);
    }
};

/**
 * WAR TERRITORY - Rendu de la Carte
 * Gère le rendu SVG et la navigation sur la carte
 */

const MapRenderer = {
    zoom: CONFIG.DEFAULT_ZOOM,
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    
    /**
     * Initialise le rendu de la carte
     */
    init: function() {
        this.setupNavigation();
        this.initMinimap();
    },
    
    /**
     * Rend la carte complète
     */
    renderMap: function(territories) {
        const svg = document.getElementById('map-svg');
        svg.setAttribute('width', CONFIG.MAP_WIDTH);
        svg.setAttribute('height', CONFIG.MAP_HEIGHT);
        svg.setAttribute('viewBox', `0 0 ${CONFIG.MAP_WIDTH} ${CONFIG.MAP_HEIGHT}`);
        svg.innerHTML = '';
        
        // Fond
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('width', CONFIG.MAP_WIDTH);
        bg.setAttribute('height', CONFIG.MAP_HEIGHT);
        bg.setAttribute('fill', '#0a1520');
        svg.appendChild(bg);
        
        // Dessiner les territoires
        territories.forEach(t => {
            // Path du territoire
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', t.path);
            path.setAttribute('class', `territory-path ${t.owner || 'neutral'}`);
            path.setAttribute('data-id', t.id);
            path.onclick = () => Game.selectTerritory(t.id);
            svg.appendChild(path);
            
            // Nom
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', t.centerX);
            label.setAttribute('y', t.centerY - 8);
            label.setAttribute('class', 'territory-label');
            label.textContent = t.name;
            svg.appendChild(label);
            
            // Troupes
            const troops = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            troops.setAttribute('x', t.centerX);
            troops.setAttribute('y', t.centerY + 12);
            troops.setAttribute('class', 'territory-troops');
            troops.textContent = `⚔️ ${t.troops}`;
            svg.appendChild(troops);
            
            // Capitale
            if (t.isCapital) {
                const capital = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                capital.setAttribute('x', t.centerX);
                capital.setAttribute('y', t.centerY + 35);
                capital.setAttribute('class', 'capital-marker');
                capital.setAttribute('text-anchor', 'middle');
                capital.textContent = '🏰';
                svg.appendChild(capital);
            }
        });
        
        // Appliquer le zoom
        const map = document.getElementById('game-map');
        map.style.width = CONFIG.MAP_WIDTH + 'px';
        map.style.height = CONFIG.MAP_HEIGHT + 'px';
        map.style.transform = `scale(${this.zoom})`;
        
        UI.updateZoomLevel(this.zoom);
    },
    
    /**
     * Met à jour un territoire spécifique
     */
    updateTerritory: function(territory) {
        const path = document.querySelector(`.territory-path[data-id="${territory.id}"]`);
        if (path) {
            path.className = `territory-path ${territory.owner || 'neutral'}`;
        }
    },
    
    /**
     * Sélectionne visuellement un territoire
     */
    selectTerritory: function(territoryId) {
        // Retirer l'ancienne sélection
        document.querySelectorAll('.territory-path.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Nouvelle sélection
        if (territoryId !== null) {
            const elem = document.querySelector(`.territory-path[data-id="${territoryId}"]`);
            if (elem) {
                elem.classList.add('selected');
            }
        }
    },
    
    /**
     * Configure la navigation (drag & zoom)
     */
    setupNavigation: function() {
        const container = document.getElementById('map-container');
        
        // Drag
        container.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('territory-path')) return;
            this.isDragging = true;
            this.dragStart = { x: e.clientX, y: e.clientY };
            container.style.cursor = 'grabbing';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            container.scrollLeft -= e.clientX - this.dragStart.x;
            container.scrollTop -= e.clientY - this.dragStart.y;
            this.dragStart = { x: e.clientX, y: e.clientY };
            this.updateMinimap();
        });
        
        document.addEventListener('mouseup', () => {
            this.isDragging = false;
            container.style.cursor = 'grab';
        });
        
        // Zoom avec molette
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY < 0) this.zoomIn();
            else this.zoomOut();
        });
        
        // Scroll listener pour minimap
        container.addEventListener('scroll', () => this.updateMinimap());
        
        // Clic en dehors pour désélectionner
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.territory-path') && !e.target.closest('#territory-info')) {
                Game.selectTerritory(null);
            }
        });
    },
    
    /**
     * Zoom avant
     */
    zoomIn: function() {
        this.zoom = Math.min(CONFIG.ZOOM_MAX, this.zoom * CONFIG.ZOOM_STEP);
        this.applyZoom();
    },
    
    /**
     * Zoom arrière
     */
    zoomOut: function() {
        this.zoom = Math.max(CONFIG.ZOOM_MIN, this.zoom / CONFIG.ZOOM_STEP);
        this.applyZoom();
    },
    
    /**
     * Réinitialise la vue
     */
    resetView: function() {
        this.zoom = CONFIG.DEFAULT_ZOOM;
        this.applyZoom();
    },
    
    /**
     * Applique le niveau de zoom
     */
    applyZoom: function() {
        document.getElementById('game-map').style.transform = `scale(${this.zoom})`;
        UI.updateZoomLevel(this.zoom);
        this.updateMinimap();
    },
    
    /**
     * Centre la vue sur un territoire
     */
    centerOn: function(territory) {
        const container = document.getElementById('map-container');
        container.scrollLeft = territory.centerX * this.zoom - container.clientWidth / 2;
        container.scrollTop = territory.centerY * this.zoom - container.clientHeight / 2;
        this.updateMinimap();
    },
    
    /**
     * Initialise la minimap
     */
    initMinimap: function() {
        const canvas = document.getElementById('minimap-canvas');
        canvas.width = 250;
        canvas.height = 180;
        
        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / canvas.width * CONFIG.MAP_WIDTH;
            const y = (e.clientY - rect.top) / canvas.height * CONFIG.MAP_HEIGHT;
            
            const container = document.getElementById('map-container');
            container.scrollLeft = x * this.zoom - container.clientWidth / 2;
            container.scrollTop = y * this.zoom - container.clientHeight / 2;
            this.updateMinimap();
        });
    },
    
    /**
     * Met à jour la minimap
     */
    updateMinimap: function() {
        if (!Game.state.territories.length) return;
        
        const canvas = document.getElementById('minimap-canvas');
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#0a1520';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const scaleX = canvas.width / CONFIG.MAP_WIDTH;
        const scaleY = canvas.height / CONFIG.MAP_HEIGHT;
        
        const colors = {
            red: '#8b2020',
            blue: '#204080',
            green: '#208040',
            yellow: '#808020',
            neutral: '#2a3a4a'
        };
        
        // Dessiner les territoires
        Game.state.territories.forEach(t => {
            ctx.fillStyle = colors[t.owner || 'neutral'];
            ctx.beginPath();
            
            if (t.vertices && t.vertices.length > 2) {
                ctx.moveTo(t.vertices[0].x * scaleX, t.vertices[0].y * scaleY);
                t.vertices.forEach(v => ctx.lineTo(v.x * scaleX, v.y * scaleY));
                ctx.closePath();
                ctx.fill();
            }
        });
        
        // Viewport
        const container = document.getElementById('map-container');
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            container.scrollLeft / this.zoom * scaleX,
            container.scrollTop / this.zoom * scaleY,
            container.clientWidth / this.zoom * scaleX,
            container.clientHeight / this.zoom * scaleY
        );
    }
};
