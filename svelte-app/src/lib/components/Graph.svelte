<script>
    import { onMount } from 'svelte';

    let {
        width = 500,
        height = 500,
        stats = [],
        settings,
        animate = true,
        mini = false,
        addHitboxMode = false,
        onRemoveStat = null,
        onAddStat = null
    } = $props();

    // Internal state for animation
    let currentStats = $state([]);
    let initialized = false;

    // Derived values
    let dimensions = $derived(settings?.dimensions || 3);
    let tiers = $derived(settings?.tiers || ['F', 'B', 'A', 'S']);
    let center = $derived({ x: width / 2, y: height / 2 });
    let radius = $derived(width > 300 ? 220 : 60);
    // Scale fix for mini graph
    let effectiveRadius = $derived(mini ? width * 0.4 : radius);

    // Grid Generation
    function getPolygonPoints(sides, r) {
        const points = [];
        const angleStep = (Math.PI * 2) / sides;
        const startAngle = -Math.PI / 2;
        for (let i = 0; i < sides; i++) {
            const angle = startAngle + (i * angleStep);
            points.push({
                x: center.x + r * Math.cos(angle),
                y: center.y + r * Math.sin(angle)
            });
        }
        return points;
    }

    function mapPoints(arr) {
        return arr.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    }

    let gridPolygons = $derived.by(() => {
        if (!dimensions) return [];
        const polys = [];
        const tierCount = tiers.length - 1;
        for (let i = tierCount; i >= 0; i--) {
            const fraction = (i + 1) / tiers.length;
            polys.push({
                points: mapPoints(getPolygonPoints(dimensions, effectiveRadius * fraction)),
                class: i === tierCount ? 'graph-web outer' : 'graph-web inner'
            });
        }
        return polys;
    });

    let gridLines = $derived.by(() => {
        if (!dimensions) return [];
        const outerPoints = getPolygonPoints(dimensions, effectiveRadius);
        return outerPoints.map(p => ({
            x1: center.x,
            y1: center.y,
            x2: p.x,
            y2: p.y
        }));
    });

    // Stat Mapping
    function getStatCoords(currentStatsValues) {
        const N = dimensions;
        const angleStep = (Math.PI * 2) / N;
        const startAngle = -Math.PI / 2;

        // Ensure stats match dimensions
        const safeStats = [...currentStatsValues];
        while(safeStats.length < N) safeStats.push(0);

        return safeStats.slice(0, N).map((val, i) => {
            const maxIndex = Math.max(1, tiers.length - 1);
            const fraction = val / maxIndex;
            const r = effectiveRadius * fraction;
            const angle = startAngle + (i * angleStep);
            return {
                x: center.x + r * Math.cos(angle),
                y: center.y + r * Math.sin(angle)
            };
        });
    }

    let shapePoints = $derived.by(() => {
        if (!currentStats.length) return "";
        return mapPoints(getStatCoords(currentStats));
    });

    let dots = $derived.by(() => {
         if (!currentStats.length) return [];
         return getStatCoords(currentStats);
    });

    // Labels
    let labels = $derived.by(() => {
        if (mini) return [];
        const res = [];
        const statNames = settings.statNames || [];
        const radiusTier = effectiveRadius + 15;
        const radiusName = effectiveRadius + 65;
        const angleStep = (Math.PI * 2) / dimensions;
        const startAngle = -Math.PI / 2;

        for (let i = 0; i < dimensions; i++) {
            const angle = startAngle + (i * angleStep);
            const statVal = currentStats[i] || 0;
            const tierLabel = tiers[statVal] || '';
            const nameLabel = statNames[i] || `Stat ${i + 1}`;

            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const align = (Math.abs(cos) < 0.1) ? 'middle' : (cos > 0 ? 'start' : 'end');
            const baseline = (Math.abs(sin) < 0.1) ? 'middle' : (sin > 0 ? 'hanging' : 'baseline');

            res.push({
                tier: {
                    x: center.x + radiusTier * cos,
                    y: center.y + radiusTier * sin,
                    text: tierLabel,
                    align,
                    baseline,
                    class: 'label-tier'
                },
                name: {
                    x: center.x + radiusName * cos,
                    y: center.y + radiusName * sin,
                    text: nameLabel,
                    align,
                    baseline,
                    class: 'label-name'
                }
            });
        }
        return res;
    });

    // Hitboxes for Adding Stats (Settings Modal)
    let hitboxes = $derived.by(() => {
        if (!addHitboxMode) return [];
        const res = [];
        const angleStep = (Math.PI * 2) / dimensions;
        const startAngle = -Math.PI / 2;

        for (let i = 0; i < dimensions; i++) {
            const angle = startAngle + (i * angleStep);
            const midAngle = angle + (angleStep / 2);

            const r = effectiveRadius;
            const x = center.x + Math.cos(midAngle) * r;
            const y = center.y + Math.sin(midAngle) * r;

            res.push({ x, y, index: i + 1 });
        }
        return res;
    });

    // Animation Loop
    $effect(() => {
        if (mini) {
            currentStats = [...stats];
            return;
        }

        if (!animate) {
             currentStats = [...stats];
             return;
        }

        // Animation logic
        const targetStats = [...stats];
        while (currentStats.length < targetStats.length) currentStats.push(0);

        let startTime = performance.now();
        const duration = 400;

        const startStats = [...currentStats];

        const loop = (t) => {
            const elapsed = t - startTime;
            const p = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - p, 3);

            currentStats = startStats.map((s, i) => {
                 const end = targetStats[i] !== undefined ? targetStats[i] : 0;
                 return s + (end - s) * ease;
            });

            if (p < 1) requestAnimationFrame(loop);
            else currentStats = targetStats;
        };
        requestAnimationFrame(loop);
    });

    // Initialize
    onMount(() => {
        currentStats = [...stats];
        while(currentStats.length < dimensions) currentStats.push(0);
        initialized = true;
    });

</script>

<svg id={mini ? "settings-mini-graph" : "stat-graph"} {width} {height} viewBox={`0 0 ${width} ${height}`}>
    <g>
        {#each gridPolygons as poly}
            <polygon points={poly.points} class={poly.class}></polygon>
        {/each}
        {#each gridLines as line}
            <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} class="graph-axis"></line>
        {/each}
    </g>

    <g>
        <polygon points={shapePoints} class="graph-shape"></polygon>
        {#each dots as dot}
            <circle cx={dot.x} cy={dot.y} r="4" class="graph-dot"></circle>
        {/each}
    </g>

    {#if !mini}
    <g class="chart-labels">
        {#each labels as label}
            <text x={label.tier.x} y={label.tier.y} class={label.tier.class} text-anchor={label.tier.align} dominant-baseline={label.tier.baseline}>{label.tier.text}</text>
            <text x={label.name.x} y={label.name.y} class={label.name.class} text-anchor={label.name.align} dominant-baseline={label.name.baseline}>{label.name.text}</text>
        {/each}
    </g>
    {/if}

    {#if addHitboxMode}
        {#each hitboxes as box}
             <!-- svelte-ignore a11y_click_events_have_key_events -->
             <!-- svelte-ignore a11y_no_static_element_interactions -->
             <g class="add-hitbox" onclick={() => onAddStat && onAddStat(box.index)} style="cursor: pointer;">
                <circle cx={box.x} cy={box.y} r="25" fill="transparent" />
                <circle class="add-hitbox-marker" cx={box.x} cy={box.y} r="8" />
                <text x={box.x} y={box.y + 4} font-size="10" text-anchor="middle" fill="white" font-weight="bold" pointer-events="none">+</text>
             </g>
        {/each}
    {/if}
</svg>
