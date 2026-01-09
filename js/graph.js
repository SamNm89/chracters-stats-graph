
export class Graph {
    constructor(svgElement) {
        this.svg = svgElement;
        this.center = { x: 250, y: 250 }; // Assuming 500x500 svg
        this.radius = 200;
        this.settings = null;
        this.currentStats = []; // Animation state
    }

    init(settings) {
        this.settings = settings;
        this.drawGrid();
        // Initialize current stats to zeros if not set
        if (!this.currentStats.length || this.currentStats.length !== settings.dimensions) {
            this.currentStats = new Array(settings.dimensions).fill(0);
        }
        this.drawShape(this.currentStats);
    }

    drawGrid() {
        this.svg.innerHTML = ''; // Clear
        const N = this.settings.dimensions;
        const tiers = this.settings.tiers.length - 1; // e.g. 5 steps for 6 tiers (0-5)

        // Draw concentric polygons (Background)
        for (let t = tiers; t >= 1; t--) {
            const fraction = t / tiers;
            const points = this.getPolygonPoints(N, this.radius * fraction);

            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));
            poly.setAttribute('class', 'graph-web');
            // Make the outer one thicker or distinct?
            if (t === tiers) poly.style.stroke = 'rgba(255,255,255,0.3)';
            this.svg.appendChild(poly);
        }

        // Draw Axes (Lines from center)
        const fullPoints = this.getPolygonPoints(N, this.radius);
        fullPoints.forEach(p => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', this.center.x);
            line.setAttribute('y1', this.center.y);
            line.setAttribute('x2', p.x);
            line.setAttribute('y2', p.y);
            line.setAttribute('class', 'graph-axis');
            this.svg.appendChild(line);
        });

        // Add Labels (S, A, B...)? Or just Vertex Names?
        // Let's add Vertex names S, F, etc later. For now just grid.
    }

    // Returns array of {x, y}
    getPolygonPoints(sides, r) {
        const points = [];
        // Start from top (negative Y)
        const angleStep = (Math.PI * 2) / sides;
        // Rotate -90deg (or -PI/2) to start at top
        const startAngle = -Math.PI / 2;

        for (let i = 0; i < sides; i++) {
            const angle = startAngle + (i * angleStep);
            const x = this.center.x + r * Math.cos(angle);
            const y = this.center.y + r * Math.sin(angle);
            points.push({ x, y });
        }
        return points;
    }

    // Draw the active data shape
    drawShape(stats) {
        // Remove old shape if exists (but we want to reuse it for animation usually)
        let shape = this.svg.querySelector('.graph-shape');
        if (!shape) {
            shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            shape.setAttribute('class', 'graph-shape');
            this.svg.appendChild(shape);
        }

        const pointsString = this.calculateShapeString(stats);
        shape.setAttribute('points', pointsString);
    }

    calculateShapeString(stats) {
        const N = this.settings.dimensions;
        const maxTier = this.settings.tiers.length - 1;
        const angleStep = (Math.PI * 2) / N;
        const startAngle = -Math.PI / 2;

        const coords = stats.map((val, i) => {
            // Normalize value (0 to maxTier) -> scale (0 to 1)
            // Clamp value just in case
            const v = Math.max(0, Math.min(val, maxTier));
            const fraction = v / maxTier;
            const r = this.radius * fraction;

            const angle = startAngle + (i * angleStep);
            return {
                x: this.center.x + r * Math.cos(angle),
                y: this.center.y + r * Math.sin(angle)
            };
        });

        return coords.map(p => `${p.x},${p.y}`).join(' ');
    }

    animateTo(targetStats) {
        // Simple D3-like interpolation could go here, 
        // but for now, CSS transition on the 'd' or 'points' attribute 
        // isn't natively supported well for 'points' in all browsers without SMIL or JS loop.
        // We will stick to CSS transition of the visual if we can, or JS interpolation.

        // Since 'points' is not easily animatable via CSS in all contexts, 
        // let's do a quick JS interpolation frame loop for smoothness.

        const startStats = [...this.currentStats];
        const startTime = performance.now();
        const duration = 300; // ms

        const animate = (time) => {
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const ease = 1 - Math.pow(1 - progress, 3);

            const interpStats = startStats.map((s, i) => {
                const target = targetStats[i] || 0;
                return s + (target - s) * ease;
            });

            this.drawShape(interpStats);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.currentStats = targetStats;
            }
        };

        requestAnimationFrame(animate);
    }
}
