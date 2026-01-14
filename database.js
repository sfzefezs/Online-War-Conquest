/**
 * WAR TERRITORY - Module Base de Données
 * Gère la persistance des données avec SQLite
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'warterritory.db');

class Database {
    constructor() {
        this.db = null;
    }

    // Initialiser la connexion à la base de données
    init() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(DB_PATH, (err) => {
                if (err) {
                    console.error('❌ Erreur connexion DB:', err);
                    reject(err);
                } else {
                    console.log('✅ Base de données connectée');
                    this.createTables()
                        .then(() => resolve())
                        .catch(reject);
                }
            });
        });
    }

    // Créer les tables si elles n'existent pas
    createTables() {
        return new Promise((resolve, reject) => {
            const queries = [
                // Table des utilisateurs
                `CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    email TEXT UNIQUE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_login DATETIME,
                    is_online INTEGER DEFAULT 0
                )`,
                
                // Table des statistiques joueur
                `CREATE TABLE IF NOT EXISTS player_stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER UNIQUE NOT NULL,
                    total_kills INTEGER DEFAULT 0,
                    total_deaths INTEGER DEFAULT 0,
                    territories_captured INTEGER DEFAULT 0,
                    buildings_built INTEGER DEFAULT 0,
                    battles_won INTEGER DEFAULT 0,
                    battles_lost INTEGER DEFAULT 0,
                    total_gold_earned INTEGER DEFAULT 0,
                    total_food_earned INTEGER DEFAULT 0,
                    games_played INTEGER DEFAULT 0,
                    total_play_time INTEGER DEFAULT 0,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )`,
                
                // Table des données de jeu sauvegardées
                `CREATE TABLE IF NOT EXISTS player_game_data (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    team TEXT,
                    gold INTEGER DEFAULT 500,
                    food INTEGER DEFAULT 300,
                    has_base INTEGER DEFAULT 0,
                    base_territory_id INTEGER,
                    kills INTEGER DEFAULT 0,
                    technologies TEXT DEFAULT '{}',
                    last_save DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )`,
                
                // Table des unités du joueur
                `CREATE TABLE IF NOT EXISTS player_units (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    unit_id TEXT NOT NULL,
                    unit_type TEXT NOT NULL,
                    health INTEGER,
                    territory_id INTEGER,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )`,
                
                // Table des bâtiments du joueur
                `CREATE TABLE IF NOT EXISTS player_buildings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    building_id TEXT NOT NULL,
                    building_type TEXT NOT NULL,
                    territory_id INTEGER NOT NULL,
                    health INTEGER,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )`,
                
                // Table des sessions actives
                `CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    token TEXT UNIQUE NOT NULL,
                    socket_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )`,
                
                // Table du classement global
                `CREATE TABLE IF NOT EXISTS leaderboard (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER UNIQUE NOT NULL,
                    username TEXT NOT NULL,
                    total_score REAL DEFAULT 0,
                    rank INTEGER,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )`
            ];

            this.db.serialize(() => {
                let completed = 0;
                queries.forEach((query, index) => {
                    this.db.run(query, (err) => {
                        if (err) {
                            console.error(`❌ Erreur création table ${index}:`, err);
                        }
                        completed++;
                        if (completed === queries.length) {
                            console.log('📊 Tables de base de données créées');
                            resolve();
                        }
                    });
                });
            });
        });
    }

    // ==================== UTILISATEURS ====================
    
    // Créer un nouvel utilisateur
    async createUser(username, password, email = null) {
        return new Promise(async (resolve, reject) => {
            try {
                // Hasher le mot de passe
                const hashedPassword = await bcrypt.hash(password, 10);
                
                this.db.run(
                    'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
                    [username, hashedPassword, email],
                    function(err) {
                        if (err) {
                            if (err.message.includes('UNIQUE constraint failed')) {
                                reject(new Error('Ce nom d\'utilisateur ou email existe déjà'));
                            } else {
                                reject(err);
                            }
                        } else {
                            const userId = this.lastID;
                            // Créer les stats par défaut
                            db.db.run(
                                'INSERT INTO player_stats (user_id) VALUES (?)',
                                [userId],
                                (err) => {
                                    if (err) console.error('Erreur création stats:', err);
                                }
                            );
                            // Créer les données de jeu par défaut
                            db.db.run(
                                'INSERT INTO player_game_data (user_id) VALUES (?)',
                                [userId],
                                (err) => {
                                    if (err) console.error('Erreur création game data:', err);
                                }
                            );
                            resolve({ id: userId, username });
                        }
                    }
                );
            } catch (err) {
                reject(err);
            }
        });
    }

    // Authentifier un utilisateur
    async authenticateUser(username, password) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM users WHERE username = ?',
                [username],
                async (err, user) => {
                    if (err) {
                        reject(err);
                    } else if (!user) {
                        reject(new Error('Utilisateur non trouvé'));
                    } else {
                        const validPassword = await bcrypt.compare(password, user.password);
                        if (validPassword) {
                            // Mettre à jour last_login
                            this.db.run(
                                'UPDATE users SET last_login = CURRENT_TIMESTAMP, is_online = 1 WHERE id = ?',
                                [user.id]
                            );
                            resolve({
                                id: user.id,
                                username: user.username,
                                email: user.email
                            });
                        } else {
                            reject(new Error('Mot de passe incorrect'));
                        }
                    }
                }
            );
        });
    }

    // Déconnecter un utilisateur
    async logoutUser(userId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE users SET is_online = 0 WHERE id = ?',
                [userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    // ==================== DONNÉES DE JEU ====================
    
    // Sauvegarder les données de jeu d'un joueur
    async savePlayerGameData(userId, data) {
        return new Promise((resolve, reject) => {
            const { team, gold, food, hasBase, baseTerritoryId, kills, technologies } = data;
            
            this.db.run(
                `UPDATE player_game_data SET 
                    team = ?, gold = ?, food = ?, has_base = ?, 
                    base_territory_id = ?, kills = ?, technologies = ?,
                    last_save = CURRENT_TIMESTAMP
                WHERE user_id = ?`,
                [team, gold, food, hasBase ? 1 : 0, baseTerritoryId, kills, 
                 JSON.stringify(technologies || {}), userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    // Charger les données de jeu d'un joueur
    async loadPlayerGameData(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM player_game_data WHERE user_id = ?',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else if (!row) resolve(null);
                    else {
                        resolve({
                            team: row.team,
                            gold: row.gold,
                            food: row.food,
                            hasBase: row.has_base === 1,
                            baseTerritoryId: row.base_territory_id,
                            kills: row.kills,
                            technologies: JSON.parse(row.technologies || '{}')
                        });
                    }
                }
            );
        });
    }

    // ==================== UNITÉS ====================
    
    // Sauvegarder les unités d'un joueur
    async savePlayerUnits(userId, units) {
        return new Promise((resolve, reject) => {
            // Supprimer les anciennes unités
            this.db.run('DELETE FROM player_units WHERE user_id = ?', [userId], (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!units || units.length === 0) {
                    resolve();
                    return;
                }

                const stmt = this.db.prepare(
                    'INSERT INTO player_units (user_id, unit_id, unit_type, health, territory_id) VALUES (?, ?, ?, ?, ?)'
                );
                
                units.forEach(unit => {
                    stmt.run(userId, unit.id, unit.type, unit.health, unit.territoryId);
                });
                
                stmt.finalize((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
    }

    // Charger les unités d'un joueur
    async loadPlayerUnits(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM player_units WHERE user_id = ?',
                [userId],
                (err, rows) => {
                    if (err) reject(err);
                    else {
                        resolve(rows.map(row => ({
                            id: row.unit_id,
                            type: row.unit_type,
                            health: row.health,
                            territoryId: row.territory_id
                        })));
                    }
                }
            );
        });
    }

    // ==================== BÂTIMENTS ====================
    
    // Sauvegarder les bâtiments d'un joueur
    async savePlayerBuildings(userId, buildings) {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM player_buildings WHERE user_id = ?', [userId], (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!buildings || buildings.length === 0) {
                    resolve();
                    return;
                }

                const stmt = this.db.prepare(
                    'INSERT INTO player_buildings (user_id, building_id, building_type, territory_id, health) VALUES (?, ?, ?, ?, ?)'
                );
                
                buildings.forEach(building => {
                    stmt.run(userId, building.id, building.type, building.territoryId, building.health);
                });
                
                stmt.finalize((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
    }

    // Charger les bâtiments d'un joueur
    async loadPlayerBuildings(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM player_buildings WHERE user_id = ?',
                [userId],
                (err, rows) => {
                    if (err) reject(err);
                    else {
                        resolve(rows.map(row => ({
                            id: row.building_id,
                            type: row.building_type,
                            territoryId: row.territory_id,
                            health: row.health
                        })));
                    }
                }
            );
        });
    }

    // ==================== STATISTIQUES ====================
    
    // Mettre à jour les statistiques d'un joueur
    async updatePlayerStats(userId, stats) {
        return new Promise((resolve, reject) => {
            const fields = [];
            const values = [];
            
            if (stats.kills !== undefined) {
                fields.push('total_kills = total_kills + ?');
                values.push(stats.kills);
            }
            if (stats.deaths !== undefined) {
                fields.push('total_deaths = total_deaths + ?');
                values.push(stats.deaths);
            }
            if (stats.territoriesCaptured !== undefined) {
                fields.push('territories_captured = territories_captured + ?');
                values.push(stats.territoriesCaptured);
            }
            if (stats.buildingsBuilt !== undefined) {
                fields.push('buildings_built = buildings_built + ?');
                values.push(stats.buildingsBuilt);
            }
            if (stats.battlesWon !== undefined) {
                fields.push('battles_won = battles_won + ?');
                values.push(stats.battlesWon);
            }
            if (stats.battlesLost !== undefined) {
                fields.push('battles_lost = battles_lost + ?');
                values.push(stats.battlesLost);
            }
            if (stats.goldEarned !== undefined) {
                fields.push('total_gold_earned = total_gold_earned + ?');
                values.push(stats.goldEarned);
            }
            if (stats.foodEarned !== undefined) {
                fields.push('total_food_earned = total_food_earned + ?');
                values.push(stats.foodEarned);
            }
            if (stats.playTime !== undefined) {
                fields.push('total_play_time = total_play_time + ?');
                values.push(stats.playTime);
            }
            
            if (fields.length === 0) {
                resolve();
                return;
            }
            
            values.push(userId);
            
            this.db.run(
                `UPDATE player_stats SET ${fields.join(', ')} WHERE user_id = ?`,
                values,
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    // Obtenir les statistiques d'un joueur
    async getPlayerStats(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM player_stats WHERE user_id = ?',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    // ==================== CLASSEMENT ====================
    
    // Mettre à jour le classement
    async updateLeaderboard(userId, username, score) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO leaderboard (user_id, username, total_score, updated_at) 
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(user_id) DO UPDATE SET 
                    total_score = ?, username = ?, updated_at = CURRENT_TIMESTAMP`,
                [userId, username, score, score, username],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    // Obtenir le classement global
    async getGlobalLeaderboard(limit = 100) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT user_id, username, total_score,
                    (SELECT COUNT(*) + 1 FROM leaderboard l2 WHERE l2.total_score > leaderboard.total_score) as rank
                 FROM leaderboard 
                 ORDER BY total_score DESC 
                 LIMIT ?`,
                [limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    // ==================== SESSIONS ====================
    
    // Créer une session
    async createSession(userId, token, socketId = null) {
        return new Promise((resolve, reject) => {
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours
            
            this.db.run(
                'INSERT INTO sessions (user_id, token, socket_id, expires_at) VALUES (?, ?, ?, ?)',
                [userId, token, socketId, expiresAt.toISOString()],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, token });
                }
            );
        });
    }

    // Valider une session
    async validateSession(token) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT s.*, u.username FROM sessions s 
                 JOIN users u ON s.user_id = u.id 
                 WHERE s.token = ? AND s.expires_at > datetime('now')`,
                [token],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    // Mettre à jour le socket_id d'une session
    async updateSessionSocket(token, socketId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE sessions SET socket_id = ? WHERE token = ?',
                [socketId, token],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    // Supprimer une session
    async deleteSession(token) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM sessions WHERE token = ?',
                [token],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    // Nettoyer les sessions expirées
    async cleanExpiredSessions() {
        return new Promise((resolve, reject) => {
            this.db.run(
                "DELETE FROM sessions WHERE expires_at < datetime('now')",
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    // Fermer la connexion
    close() {
        if (this.db) {
            this.db.close();
        }
    }
}

// Singleton
const db = new Database();

module.exports = db;
