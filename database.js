/**
 * WAR TERRITORY - Module Base de Données MySQL
 * Gère la persistance des données avec MySQL Hostinger
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// Configuration MySQL Hostinger
const DB_CONFIG = {
    host: process.env.DB_HOST || 'srv1590.hstgr.io',
    user: process.env.DB_USER || 'u568676681_cam',
    password: process.env.DB_PASSWORD || 'Camais6969.',
    database: process.env.DB_NAME || 'u568676681_cam',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

class Database {
    constructor() {
        this.pool = null;
    }

    // Initialiser la connexion à la base de données
    async init() {
        try {
            this.pool = mysql.createPool(DB_CONFIG);
            
            // Tester la connexion
            const connection = await this.pool.getConnection();
            console.log('✅ Connecté à MySQL Hostinger');
            connection.release();
            
            // Créer les tables
            await this.createTables();
            
            return true;
        } catch (err) {
            console.error('❌ Erreur connexion MySQL:', err.message);
            throw err;
        }
    }

    // Créer les tables si elles n'existent pas
    async createTables() {
        const queries = [
            // Table des utilisateurs
            `CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                email VARCHAR(100) UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL,
                is_online TINYINT DEFAULT 0
            )`,
            
            // Table des statistiques joueur
            `CREATE TABLE IF NOT EXISTS player_stats (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT UNIQUE NOT NULL,
                total_kills INT DEFAULT 0,
                total_deaths INT DEFAULT 0,
                territories_captured INT DEFAULT 0,
                buildings_built INT DEFAULT 0,
                battles_won INT DEFAULT 0,
                battles_lost INT DEFAULT 0,
                total_gold_earned INT DEFAULT 0,
                total_food_earned INT DEFAULT 0,
                games_played INT DEFAULT 0,
                total_play_time INT DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            
            // Table des données de jeu sauvegardées
            `CREATE TABLE IF NOT EXISTS player_game_data (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                team VARCHAR(20),
                gold INT DEFAULT 500,
                food INT DEFAULT 300,
                has_base TINYINT DEFAULT 0,
                base_territory_id INT,
                kills INT DEFAULT 0,
                technologies JSON,
                last_save TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            
            // Table des unités du joueur
            `CREATE TABLE IF NOT EXISTS player_units (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                unit_id VARCHAR(100) NOT NULL,
                unit_type VARCHAR(50) NOT NULL,
                health INT,
                territory_id INT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            
            // Table des bâtiments du joueur
            `CREATE TABLE IF NOT EXISTS player_buildings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                building_id VARCHAR(100) NOT NULL,
                building_type VARCHAR(50) NOT NULL,
                territory_id INT NOT NULL,
                health INT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            
            // Table des sessions actives
            `CREATE TABLE IF NOT EXISTS sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                token VARCHAR(255) UNIQUE NOT NULL,
                socket_id VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            
            // Table du classement global
            `CREATE TABLE IF NOT EXISTS leaderboard (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT UNIQUE NOT NULL,
                username VARCHAR(50) NOT NULL,
                total_score DECIMAL(15,2) DEFAULT 0,
                rank_position INT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            
            // Table de l'état global du jeu
            `CREATE TABLE IF NOT EXISTS game_state (
                id INT PRIMARY KEY DEFAULT 1,
                map_seed INT NOT NULL,
                war_period TINYINT DEFAULT 0,
                cycle_start_time BIGINT,
                next_change BIGINT,
                saved_at BIGINT
            )`,
            
            // Table des territoires
            `CREATE TABLE IF NOT EXISTS territories (
                id INT PRIMARY KEY,
                owner VARCHAR(100),
                team VARCHAR(20),
                units JSON,
                base JSON
            )`,
            
            // Table des données d'équipes
            `CREATE TABLE IF NOT EXISTS teams (
                id VARCHAR(20) PRIMARY KEY,
                territories INT DEFAULT 0,
                total_kills INT DEFAULT 0
            )`
        ];

        for (const query of queries) {
            try {
                await this.pool.execute(query);
            } catch (err) {
                console.error('❌ Erreur création table:', err.message);
            }
        }
        
        console.log('📊 Tables MySQL créées/vérifiées');
    }

    // ==================== UTILISATEURS ====================
    
    // Créer un nouvel utilisateur
    async createUser(username, password, email = null) {
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            
            const [result] = await this.pool.execute(
                'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
                [username, hashedPassword, email]
            );
            
            const userId = result.insertId;
            
            // Créer les stats par défaut
            await this.pool.execute(
                'INSERT INTO player_stats (user_id) VALUES (?)',
                [userId]
            );
            
            // Créer les données de jeu par défaut
            await this.pool.execute(
                'INSERT INTO player_game_data (user_id, technologies) VALUES (?, ?)',
                [userId, JSON.stringify({})]
            );
            
            return { id: userId, username };
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                throw new Error('Ce nom d\'utilisateur ou email existe déjà');
            }
            throw err;
        }
    }

    // Authentifier un utilisateur
    async authenticateUser(username, password) {
        const [rows] = await this.pool.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        
        if (rows.length === 0) {
            throw new Error('Utilisateur non trouvé');
        }
        
        const user = rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            throw new Error('Mot de passe incorrect');
        }
        
        // Mettre à jour last_login
        await this.pool.execute(
            'UPDATE users SET last_login = NOW(), is_online = 1 WHERE id = ?',
            [user.id]
        );
        
        return {
            id: user.id,
            username: user.username,
            email: user.email
        };
    }

    // Déconnecter un utilisateur
    async logoutUser(userId) {
        await this.pool.execute(
            'UPDATE users SET is_online = 0 WHERE id = ?',
            [userId]
        );
    }

    // ==================== DONNÉES DE JEU ====================
    
    // Sauvegarder les données de jeu d'un joueur
    async savePlayerGameData(userId, data) {
        const { team, gold, food, hasBase, baseTerritoryId, kills, technologies } = data;
        
        await this.pool.execute(
            `UPDATE player_game_data SET 
                team = ?, gold = ?, food = ?, has_base = ?, 
                base_territory_id = ?, kills = ?, technologies = ?,
                last_save = NOW()
            WHERE user_id = ?`,
            [team, gold, food, hasBase ? 1 : 0, baseTerritoryId, kills, 
             JSON.stringify(technologies || {}), userId]
        );
    }

    // Charger les données de jeu d'un joueur
    async loadPlayerGameData(userId) {
        const [rows] = await this.pool.execute(
            'SELECT * FROM player_game_data WHERE user_id = ?',
            [userId]
        );
        
        if (rows.length === 0) return null;
        
        const row = rows[0];
        return {
            team: row.team,
            gold: row.gold,
            food: row.food,
            hasBase: row.has_base === 1,
            baseTerritoryId: row.base_territory_id,
            kills: row.kills,
            technologies: typeof row.technologies === 'string' 
                ? JSON.parse(row.technologies) 
                : (row.technologies || {})
        };
    }

    // ==================== UNITÉS ====================
    
    // Sauvegarder les unités d'un joueur
    async savePlayerUnits(userId, units) {
        // Supprimer les anciennes unités
        await this.pool.execute('DELETE FROM player_units WHERE user_id = ?', [userId]);
        
        if (!units || units.length === 0) return;
        
        for (const unit of units) {
            await this.pool.execute(
                'INSERT INTO player_units (user_id, unit_id, unit_type, health, territory_id) VALUES (?, ?, ?, ?, ?)',
                [userId, unit.id, unit.type, unit.health, unit.territoryId]
            );
        }
    }

    // Charger les unités d'un joueur
    async loadPlayerUnits(userId) {
        const [rows] = await this.pool.execute(
            'SELECT * FROM player_units WHERE user_id = ?',
            [userId]
        );
        
        return rows.map(row => ({
            id: row.unit_id,
            type: row.unit_type,
            health: row.health,
            territoryId: row.territory_id
        }));
    }

    // ==================== BÂTIMENTS ====================
    
    // Sauvegarder les bâtiments d'un joueur
    async savePlayerBuildings(userId, buildings) {
        await this.pool.execute('DELETE FROM player_buildings WHERE user_id = ?', [userId]);
        
        if (!buildings || buildings.length === 0) return;
        
        for (const building of buildings) {
            await this.pool.execute(
                'INSERT INTO player_buildings (user_id, building_id, building_type, territory_id, health) VALUES (?, ?, ?, ?, ?)',
                [userId, building.id, building.type, building.territoryId, building.health]
            );
        }
    }

    // Charger les bâtiments d'un joueur
    async loadPlayerBuildings(userId) {
        const [rows] = await this.pool.execute(
            'SELECT * FROM player_buildings WHERE user_id = ?',
            [userId]
        );
        
        return rows.map(row => ({
            id: row.building_id,
            type: row.building_type,
            territoryId: row.territory_id,
            health: row.health
        }));
    }

    // ==================== STATISTIQUES ====================
    
    // Mettre à jour les statistiques d'un joueur
    async updatePlayerStats(userId, stats) {
        const updates = [];
        const values = [];
        
        if (stats.kills !== undefined) {
            updates.push('total_kills = total_kills + ?');
            values.push(stats.kills);
        }
        if (stats.deaths !== undefined) {
            updates.push('total_deaths = total_deaths + ?');
            values.push(stats.deaths);
        }
        if (stats.territoriesCaptured !== undefined) {
            updates.push('territories_captured = territories_captured + ?');
            values.push(stats.territoriesCaptured);
        }
        if (stats.buildingsBuilt !== undefined) {
            updates.push('buildings_built = buildings_built + ?');
            values.push(stats.buildingsBuilt);
        }
        if (stats.battlesWon !== undefined) {
            updates.push('battles_won = battles_won + ?');
            values.push(stats.battlesWon);
        }
        if (stats.battlesLost !== undefined) {
            updates.push('battles_lost = battles_lost + ?');
            values.push(stats.battlesLost);
        }
        if (stats.goldEarned !== undefined) {
            updates.push('total_gold_earned = total_gold_earned + ?');
            values.push(stats.goldEarned);
        }
        if (stats.foodEarned !== undefined) {
            updates.push('total_food_earned = total_food_earned + ?');
            values.push(stats.foodEarned);
        }
        if (stats.playTime !== undefined) {
            updates.push('total_play_time = total_play_time + ?');
            values.push(stats.playTime);
        }
        
        if (updates.length === 0) return;
        
        values.push(userId);
        
        await this.pool.execute(
            `UPDATE player_stats SET ${updates.join(', ')} WHERE user_id = ?`,
            values
        );
    }

    // Obtenir les statistiques d'un joueur
    async getPlayerStats(userId) {
        const [rows] = await this.pool.execute(
            'SELECT * FROM player_stats WHERE user_id = ?',
            [userId]
        );
        return rows[0] || null;
    }

    // ==================== CLASSEMENT ====================
    
    // Mettre à jour le classement
    async updateLeaderboard(userId, username, score) {
        await this.pool.execute(
            `INSERT INTO leaderboard (user_id, username, total_score) 
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE 
                total_score = ?, username = ?, updated_at = NOW()`,
            [userId, username, score, score, username]
        );
    }

    // Obtenir le classement global
    async getGlobalLeaderboard(limit = 100) {
        const [rows] = await this.pool.execute(
            `SELECT user_id, username, total_score,
                (SELECT COUNT(*) + 1 FROM leaderboard l2 WHERE l2.total_score > leaderboard.total_score) as rank_position
             FROM leaderboard 
             ORDER BY total_score DESC 
             LIMIT ?`,
            [limit]
        );
        return rows;
    }

    // ==================== SESSIONS ====================
    
    // Créer une session
    async createSession(userId, token, socketId = null) {
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours
        
        const [result] = await this.pool.execute(
            'INSERT INTO sessions (user_id, token, socket_id, expires_at) VALUES (?, ?, ?, ?)',
            [userId, token, socketId, expiresAt]
        );
        
        return { id: result.insertId, token };
    }

    // Valider une session
    async validateSession(token) {
        const [rows] = await this.pool.execute(
            `SELECT s.*, u.username FROM sessions s 
             JOIN users u ON s.user_id = u.id 
             WHERE s.token = ? AND s.expires_at > NOW()`,
            [token]
        );
        return rows[0] || null;
    }

    // Mettre à jour le socket_id d'une session
    async updateSessionSocket(token, socketId) {
        await this.pool.execute(
            'UPDATE sessions SET socket_id = ? WHERE token = ?',
            [socketId, token]
        );
    }

    // Supprimer une session
    async deleteSession(token) {
        await this.pool.execute(
            'DELETE FROM sessions WHERE token = ?',
            [token]
        );
    }

    // Nettoyer les sessions expirées
    async cleanExpiredSessions() {
        await this.pool.execute(
            'DELETE FROM sessions WHERE expires_at < NOW()'
        );
    }

    // ==================== ÉTAT DU JEU GLOBAL ====================
    
    // Sauvegarder l'état global du jeu
    async saveGameState(gameState) {
        const { mapSeed, warPeriod, cycleStartTime, nextChange } = gameState;
        
        await this.pool.execute(
            `INSERT INTO game_state (id, map_seed, war_period, cycle_start_time, next_change, saved_at)
             VALUES (1, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
                map_seed = ?, war_period = ?, cycle_start_time = ?, next_change = ?, saved_at = ?`,
            [mapSeed, warPeriod ? 1 : 0, cycleStartTime, nextChange, Date.now(),
             mapSeed, warPeriod ? 1 : 0, cycleStartTime, nextChange, Date.now()]
        );
    }
    
    // Charger l'état global du jeu
    async loadGameState() {
        const [rows] = await this.pool.execute(
            'SELECT * FROM game_state WHERE id = 1'
        );
        
        if (rows.length === 0) return null;
        
        const row = rows[0];
        return {
            mapSeed: row.map_seed,
            warPeriod: row.war_period === 1,
            cycleStartTime: row.cycle_start_time,
            nextChange: row.next_change,
            savedAt: row.saved_at
        };
    }
    
    // ==================== TERRITOIRES ====================
    
    // Sauvegarder tous les territoires
    async saveAllTerritories(territories) {
        for (const t of territories) {
            await this.pool.execute(
                `INSERT INTO territories (id, owner, team, units, base)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE 
                    owner = ?, team = ?, units = ?, base = ?`,
                [t.id, t.owner || null, t.team || null, 
                 JSON.stringify(t.units || []), 
                 t.base ? JSON.stringify(t.base) : null,
                 t.owner || null, t.team || null,
                 JSON.stringify(t.units || []),
                 t.base ? JSON.stringify(t.base) : null]
            );
        }
    }
    
    // Charger tous les territoires
    async loadAllTerritories() {
        const [rows] = await this.pool.execute(
            'SELECT * FROM territories ORDER BY id'
        );
        
        return rows.map(row => ({
            id: row.id,
            owner: row.owner,
            team: row.team,
            units: typeof row.units === 'string' ? JSON.parse(row.units) : (row.units || []),
            base: row.base ? (typeof row.base === 'string' ? JSON.parse(row.base) : row.base) : null
        }));
    }
    
    // Sauvegarder un seul territoire
    async saveTerritory(territory) {
        await this.pool.execute(
            `INSERT INTO territories (id, owner, team, units, base)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
                owner = ?, team = ?, units = ?, base = ?`,
            [territory.id, territory.owner || null, territory.team || null,
             JSON.stringify(territory.units || []),
             territory.base ? JSON.stringify(territory.base) : null,
             territory.owner || null, territory.team || null,
             JSON.stringify(territory.units || []),
             territory.base ? JSON.stringify(territory.base) : null]
        );
    }
    
    // ==================== ÉQUIPES ====================
    
    // Sauvegarder les données d'équipes
    async saveTeams(teams) {
        for (const teamId of Object.keys(teams)) {
            const team = teams[teamId];
            await this.pool.execute(
                `INSERT INTO teams (id, territories, total_kills)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE 
                    territories = ?, total_kills = ?`,
                [teamId, team.territories || 0, team.totalKills || 0,
                 team.territories || 0, team.totalKills || 0]
            );
        }
    }
    
    // Charger les données d'équipes
    async loadTeams() {
        const [rows] = await this.pool.execute('SELECT * FROM teams');
        
        const teams = {};
        rows.forEach(row => {
            teams[row.id] = {
                territories: row.territories,
                totalKills: row.total_kills
            };
        });
        return teams;
    }

    // Fermer la connexion
    async close() {
        if (this.pool) {
            await this.pool.end();
        }
    }
}

// Singleton
const db = new Database();

module.exports = db;
