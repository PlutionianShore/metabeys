

const STATS_URL = 'http://localhost:8787/stats';

//where the json is stored
let statsData = null;

async function loadStats() {
    const response = await fetch(STATS_URL);
    statsData = await response.json();
    console.log(statsData);
}

function toDisplayName(joined) {
    return joined.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function partImageSlug(joined) {
    return joined.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function renderBlades(windowKey) {
    const container = document.getElementById('blade-list');
    const blades = statsData[windowKey].byBlade;

    container.innerHTML = blades.map(blade => `
        <div class="blade-card">
            <h2>${blade.blade} (${blade.totalUses} uses)</h2>
            <ul>
                ${blade.topParts.map(part => `
                    <li>${part.part_type}: ${part.part} (${part.uses})</li>
                `).join('')}
            </ul>
        </div>
    `).join('');
}

loadStats();