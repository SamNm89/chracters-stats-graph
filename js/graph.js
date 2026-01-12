export class Graph {
    constructor(svgElement) {
        this.svg = svgElement;
        this.width = 800;  // Increased internal coordinate space
        this.height = 800;
        this.center = { x: 400, y: 400 };
        this.radius = 180;
        this.settings = null;
        this.currentStats = [];
        this.svg.setAttribute('viewBox', `0 0 800 800`);
    }

    init(settings) {
        this.settings = settings;
        this.dimensions = settings.dimensions;

        // Use smaller radius relative to 800px space to ensure labels fit
        this.radius = this.width > 300 ? 220 : 60;

        this.currentStats = new Array(settings.dimensions).fill(0);
        this.displayedStats = [...this.currentStats]; // Track what is currently drawn
        this.animationId = null; // Track active animation frame

        this.drawGrid();
        this.drawShape(this.currentStats);
    }

    drawGrid() {
        this.svg.innerHTML = '';

        // Create Layer Groups
        this.gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.polyGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.labelsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.labelsGroup.setAttribute('class', 'chart-labels');

        this.svg.appendChild(this.gridGroup);
        this.svg.appendChild(this.polyGroup);
        this.svg.appendChild(this.labelsGroup);

        const N = this.settings.dimensions;
        const tiers = this.settings.tiers;
        const tierCount = tiers.length - 1;

        for (let i = tierCount; i >= 0; i--) {
            const fraction = (i + 1) / tiers.length;
            const points = this.getPolygonPoints(N, this.radius * fraction);
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', mapPoints(points));
            poly.setAttribute('class', i === tierCount ? 'graph-web outer' : 'graph-web inner');
            this.gridGroup.appendChild(poly);
        }

        const outerPoints = this.getPolygonPoints(N, this.radius);
        outerPoints.forEach((p) => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', this.center.x);
            line.setAttribute('y1', this.center.y);
            line.setAttribute('x2', p.x);
            line.setAttribute('y2', p.y);
            line.setAttribute('class', 'graph-axis');
            this.gridGroup.appendChild(line);
        });
    }

    drawLabels(stats) {
        if (!this.labelsGroup) return;
        this.labelsGroup.innerHTML = '';

        const statNames = this.settings.statNames || [];
        const tiers = this.settings.tiers;

        // Increased distance between Tier and Name to prevent overlap on horizontal axes
        const radiusTier = this.radius + 15;
        const radiusName = this.radius + 65;

        for (let i = 0; i < this.dimensions; i++) {
            const angle = -Math.PI / 2 + (Math.PI * 2 * i) / this.dimensions;
            const statVal = stats ? (stats[i] || 0) : 0;
            const tierLabel = tiers[statVal] || '';
            const nameLabel = statNames[i] || `Stat ${i + 1}`;

            // Helper to anchor text based on angle
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const align = (Math.abs(cos) < 0.1) ? 'middle' : (cos > 0 ? 'start' : 'end');
            const baseline = (Math.abs(sin) < 0.1) ? 'middle' : (sin > 0 ? 'hanging' : 'baseline');

            // 1. Tier Label (Inner)
            const tx = this.center.x + radiusTier * cos;
            const ty = this.center.y + radiusTier * sin;
            this.drawText(tx, ty, tierLabel, this.labelsGroup, 'label-tier', align, baseline);

            // 2. Name Label (Outer)
            // To prevent horizontal overlap with tier when labels are long on the sides:
            // If we are strictly horizontal, we can offset the Name Y slightly.
            const nx = this.center.x + radiusName * cos;
            const ny = this.center.y + radiusName * sin;

            this.drawText(nx, ny, nameLabel, this.labelsGroup, 'label-name', align, baseline);
        }
    }

    drawText(x, y, text, parent, className, align, baseline) {
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', x);
        t.setAttribute('y', y);
        t.setAttribute('class', className);
        t.setAttribute('text-anchor', align);
        t.setAttribute('dominant-baseline', baseline);
        t.textContent = text;
        parent.appendChild(t);
    }

    getPolygonPoints(sides, r) {
        const points = [];
        const angleStep = (Math.PI * 2) / sides;
        const startAngle = -Math.PI / 2;
        for (let i = 0; i < sides; i++) {
            const angle = startAngle + (i * angleStep);
            points.push({
                x: this.center.x + r * Math.cos(angle),
                y: this.center.y + r * Math.sin(angle)
            });
        }
        return points;
    }

    drawShape(stats) {
        // Ensure groups exist if accidentally wiped (safety)
        if (!this.polyGroup) this.drawGrid();

        let shape = this.polyGroup.querySelector('.graph-shape');
        if (!shape) {
            shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            shape.setAttribute('class', 'graph-shape');
            this.polyGroup.appendChild(shape);
        }
        const pointsString = this.calculateShapeString(stats);
        shape.setAttribute('points', pointsString);

        this.polyGroup.querySelectorAll('.graph-dot').forEach(el => el.remove());
        const coords = this.getStatCoords(stats);
        coords.forEach(p => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', p.x);
            circle.setAttribute('cy', p.y);
            circle.setAttribute('r', 4);
            circle.setAttribute('class', 'graph-dot');
            this.polyGroup.appendChild(circle);
        });
    }

    getStatCoords(stats) {
        const N = this.settings.dimensions;
        const tiers = this.settings.tiers;
        const angleStep = (Math.PI * 2) / N;
        const startAngle = -Math.PI / 2;

        return stats.map((val, i) => {
            // Map 0 -> 0 (center), Max -> 1 (edge)
            // tiers.length - 1 is the max index
            const maxIndex = Math.max(1, tiers.length - 1);
            const fraction = val / maxIndex;

            const r = this.radius * fraction;
            const angle = startAngle + (i * angleStep);
            return {
                x: this.center.x + r * Math.cos(angle),
                y: this.center.y + r * Math.sin(angle)
            };
        });
    }

    calculateShapeString(stats) {
        const coords = this.getStatCoords(stats);
        return mapPoints(coords);
    }

    animateTo(targetStats) {
        // Cancel any running animation to prevent fighting loops
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        // Update Labels immediately
        this.drawLabels(targetStats);

        // Start from what is currently ON SCREEN, not the last "settled" state
        // This prevents the graph from jumping back if a new event fires mid-animation
        const startStats = this.displayedStats ? [...this.displayedStats] : [...this.currentStats];

        // Ensure lengths match if dimensions changed (resizing arrays)
        while (startStats.length < targetStats.length) startStats.push(0);

        const startTime = performance.now();
        const duration = 200; // Slightly faster for snappier feel

        const loop = (t) => {
            const elapsed = t - startTime;
            const p = Math.min(elapsed / duration, 1);

            // Cubic ease-out
            const ease = 1 - Math.pow(1 - p, 3);

            const interp = startStats.map((s, i) => {
                const end = targetStats[i] !== undefined ? targetStats[i] : 0;
                return s + (end - s) * ease;
            });

            // Update displayed stats tracking
            this.displayedStats = interp;
            this.drawShape(interp);

            // Continue or Finish
            if (p < 1) {
                this.animationId = requestAnimationFrame(loop);
            } else {
                this.currentStats = targetStats;
                this.displayedStats = [...targetStats]; // Ensure exact final value
                this.animationId = null;
            }
        };

        this.animationId = requestAnimationFrame(loop);
    }
}

function mapPoints(arr) { return arr.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '); }
