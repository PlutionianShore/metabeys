const STATS_URL = 'http://localhost:8787/stats';

let statsData = null;

async function loadStats() {
    //load default week1 stats
    const response = await fetch(STATS_URL);
    statsData = await response.json();
    document.querySelector('#week-tabs button').classList.add('active');
    renderBlades('week1');
}

function toDisplayName(joined) {
    return joined.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function partImageSlug(joined) {
    return joined.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function bladeImageSlug(joined) {
    return joined.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function renderBlades(windowKey) {
    const container = document.getElementById('blade-list');
    const blades = statsData[windowKey].byBlade.slice(0, 20);;

    container.innerHTML = blades.map((blade, index) => `
        <div class="blade-card">
            <div class="blade-row">
                <span class="rank">#${index + 1}</span>
                <img class="blade-img" src="images/blades/${bladeImageSlug(blade.blade)}.png"
                     onerror="this.onerror=null; this.src='images/blades/placeholder.png';">
                <span class="blade-name">${toDisplayName(blade.blade)}</span>
                <span class="blade-uses">${blade.totalUses} uses</span>
            </div>
            <div class="parts-list">
                ${blade.topParts.map((part, partIndex) => `
                    <div class="part-row">
                        <span class="rank">#${partIndex + 1}</span>
                        <img class="part-img" src="images/parts/${partImageSlug(part.part)}.png"
                             onerror="this.onerror=null; this.src='images/parts/placeholder.png';">
                        <span class="part-name">${toDisplayName(part.part)} (${part.part_type})</span>
                        <span class="part-uses">${part.uses} uses</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

//if you click in the container, it finds which row was closest, possibly locked in strat?
document.getElementById('blade-list').addEventListener('click', (event) => {
    const row = event.target.closest('.blade-row');
    if (!row) return;

    const card = row.closest('.blade-card');
    card.classList.toggle('expanded');
});

//week buttons
document.querySelectorAll('#week-tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#week-tabs button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderBlades(btn.dataset.window);
    });
});

loadStats();