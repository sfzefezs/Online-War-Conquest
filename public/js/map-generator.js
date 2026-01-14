/**
 * WAR TERRITORY - Générateur de Carte Voronoi
 * Génère la carte du jeu avec des territoires basés sur des diagrammes de Voronoi
 */

const MapGenerator = {
    // Générateur de nombres pseudo-aléatoires avec seed
    seededRandom: function(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    },
    
    /**
     * Génère tous les points de base pour les territoires
     */
    generatePoints: function(seed) {
        const points = [];
        let currentSeed = seed;
        
        const teams = ['red', 'blue', 'green', 'yellow'];
        const corners = [
            { x: CONFIG.CORNER_OFFSET, y: CONFIG.CORNER_OFFSET }, // Nord-Ouest (red)
            { x: CONFIG.MAP_WIDTH - CONFIG.CORNER_OFFSET, y: CONFIG.CORNER_OFFSET }, // Nord-Est (blue)
            { x: CONFIG.CORNER_OFFSET, y: CONFIG.MAP_HEIGHT - CONFIG.CORNER_OFFSET }, // Sud-Ouest (green)
            { x: CONFIG.MAP_WIDTH - CONFIG.CORNER_OFFSET, y: CONFIG.MAP_HEIGHT - CONFIG.CORNER_OFFSET } // Sud-Est (yellow)
        ];
        
        // Générer les territoires d'équipes dans les coins
        teams.forEach((team, teamIndex) => {
            const corner = corners[teamIndex];
            for (let i = 0; i < CONFIG.TEAMS_PER_CORNER; i++) {
                const offsetX = (teamIndex % 2 === 0) ? 1 : -1;
                const offsetY = (teamIndex < 2) ? 1 : -1;
                
                points.push({
                    x: corner.x + offsetX * this.seededRandom(currentSeed++) * CONFIG.CORNER_SPREAD,
                    y: corner.y + offsetY * this.seededRandom(currentSeed++) * CONFIG.CORNER_SPREAD,
                    team: team,
                    isCapital: i === 0
                });
            }
        });
        
        // Générer les territoires neutres
        for (let i = points.length; i < CONFIG.TERRITORY_COUNT; i++) {
            points.push({
                x: 800 + this.seededRandom(currentSeed++) * (CONFIG.MAP_WIDTH - 1600),
                y: 800 + this.seededRandom(currentSeed++) * (CONFIG.MAP_HEIGHT - 1600),
                team: null,
                isCapital: false
            });
            currentSeed++;
        }
        
        return points;
    },
    
    /**
     * Calcule les cellules Voronoi pour chaque point
     */
    computeVoronoiCell: function(point, allPoints, pointIndex) {
        // Polygone initial (grand rectangle)
        let polygon = [
            { x: -100, y: -100 },
            { x: CONFIG.MAP_WIDTH + 100, y: -100 },
            { x: CONFIG.MAP_WIDTH + 100, y: CONFIG.MAP_HEIGHT + 100 },
            { x: -100, y: CONFIG.MAP_HEIGHT + 100 }
        ];
        
        // Couper par chaque bissectrice perpendiculaire
        allPoints.forEach((other, otherIndex) => {
            if (pointIndex === otherIndex) return;
            
            const midX = (point.x + other.x) / 2;
            const midY = (point.y + other.y) / 2;
            const dx = other.x - point.x;
            const dy = other.y - point.y;
            
            polygon = this.clipPolygon(polygon, midX, midY, -dx, -dy);
        });
        
        // Clipper aux bords
        polygon = this.clipPolygon(polygon, 0, CONFIG.MAP_HEIGHT / 2, 1, 0);
        polygon = this.clipPolygon(polygon, CONFIG.MAP_WIDTH, CONFIG.MAP_HEIGHT / 2, -1, 0);
        polygon = this.clipPolygon(polygon, CONFIG.MAP_WIDTH / 2, 0, 0, 1);
        polygon = this.clipPolygon(polygon, CONFIG.MAP_WIDTH / 2, CONFIG.MAP_HEIGHT, 0, -1);
        
        // Ajouter des irrégularités
        polygon = this.addIrregularities(polygon, pointIndex);
        
        return {
            path: this.polygonToPath(polygon),
            vertices: polygon
        };
    },
    
    /**
     * Coupe un polygone par une ligne
     */
    clipPolygon: function(polygon, px, py, nx, ny) {
        if (polygon.length < 3) return polygon;
        
        const result = [];
        
        for (let i = 0; i < polygon.length; i++) {
            const current = polygon[i];
            const next = polygon[(i + 1) % polygon.length];
            
            const currentSide = (current.x - px) * nx + (current.y - py) * ny;
            const nextSide = (next.x - px) * nx + (next.y - py) * ny;
            
            if (currentSide >= 0) {
                result.push(current);
            }
            
            if ((currentSide >= 0 && nextSide < 0) || (currentSide < 0 && nextSide >= 0)) {
                const t = currentSide / (currentSide - nextSide);
                result.push({
                    x: current.x + t * (next.x - current.x),
                    y: current.y + t * (next.y - current.y)
                });
            }
        }
        
        return result;
    },
    
    /**
     * Ajoute des irrégularités aux frontières
     */
    addIrregularities: function(polygon, seed) {
        const result = [];
        let localSeed = seed * 1000;
        
        for (let i = 0; i < polygon.length; i++) {
            const current = polygon[i];
            const next = polygon[(i + 1) % polygon.length];
            
            result.push(current);
            
            const dist = Math.sqrt((next.x - current.x) ** 2 + (next.y - current.y) ** 2);
            const steps = Math.floor(dist / 150);
            
            for (let j = 1; j < steps; j++) {
                const t = j / steps;
                const perpX = -(next.y - current.y) / dist;
                const perpY = (next.x - current.x) / dist;
                const offset = (this.seededRandom(localSeed++) - 0.5) * 60;
                
                result.push({
                    x: current.x + t * (next.x - current.x) + perpX * offset,
                    y: current.y + t * (next.y - current.y) + perpY * offset
                });
            }
        }
        
        return result;
    },
    
    /**
     * Convertit un polygone en path SVG
     */
    polygonToPath: function(polygon) {
        if (polygon.length < 3) return '';
        
        let path = `M ${polygon[0].x.toFixed(1)} ${polygon[0].y.toFixed(1)}`;
        for (let i = 1; i < polygon.length; i++) {
            path += ` L ${polygon[i].x.toFixed(1)} ${polygon[i].y.toFixed(1)}`;
        }
        path += ' Z';
        
        return path;
    },
    
    /**
     * Calcule les voisins de chaque territoire
     */
    computeNeighbors: function(territories) {
        for (let i = 0; i < territories.length; i++) {
            territories[i].neighbors = [];
            for (let j = 0; j < territories.length; j++) {
                if (i === j) continue;
                
                const dist = Math.sqrt(
                    (territories[i].centerX - territories[j].centerX) ** 2 +
                    (territories[i].centerY - territories[j].centerY) ** 2
                );
                
                if (dist < CONFIG.NEIGHBOR_DISTANCE) {
                    territories[i].neighbors.push(j);
                }
            }
        }
    },
    
    /**
     * Génère la carte complète à partir d'un seed
     */
    generateMap: function(seed, progressCallback) {
        const points = this.generatePoints(seed);
        const territories = [];
        const total = points.length;
        
        // Générer chaque territoire
        points.forEach((point, index) => {
            if (progressCallback && index % 50 === 0) {
                progressCallback(`Génération des territoires: ${Math.floor(index / total * 100)}%`);
            }
            
            const cell = this.computeVoronoiCell(point, points, index);
            
            const troops = point.isCapital 
                ? CONFIG.CAPITAL_TROOPS 
                : (point.team 
                    ? CONFIG.TEAM_BASE_TROOPS 
                    : CONFIG.NEUTRAL_MIN_TROOPS + Math.floor(this.seededRandom(seed + index) * (CONFIG.NEUTRAL_MAX_TROOPS - CONFIG.NEUTRAL_MIN_TROOPS)));
            
            territories.push({
                id: index,
                name: CONFIG.TERRITORY_NAMES[index % CONFIG.TERRITORY_NAMES.length],
                centerX: point.x,
                centerY: point.y,
                path: cell.path,
                vertices: cell.vertices,
                owner: point.team,
                troops: troops,
                isCapital: point.isCapital,
                neighbors: []
            });
        });
        
        if (progressCallback) {
            progressCallback('Calcul des frontières...');
        }
        
        // Calculer les voisins
        this.computeNeighbors(territories);
        
        return territories;
    }
};
