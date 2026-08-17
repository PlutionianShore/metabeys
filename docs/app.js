const STATS_URL = 'https://metabeys.meta-plutonian.workers.dev/stats';

let statsData = null;

async function loadStats() {
    /*load week1 stats*/
    const response = await fetch(STATS_URL + currentSourceParam());
    statsData = await response.json();
    if (!document.querySelector('#week-tabs button.active')) {
        document.querySelector('#week-tabs button').classList.add('active');
    }
    renderCurrentView();
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
                ${blade.topParts.filter(part => part.part.length > 1).map((part, partIndex) => `
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

function renderBits(windowKey) {
    const container = document.getElementById('blade-list') ;
    const bits = statsData[windowKey].byBit;

    container.innerHTML = bits.map((bit, index) => `
        <div class="blade-card">
            <div class="blade-row">
                <span class="rank">#${index + 1}</span>
                <img class="bit-img" src="images/parts/${partImageSlug(bit.part)}.png"
                     onerror="this.onerror=null; this.src='images/parts/placeholder.png';">
                <span class="blade-name">${toDisplayName(bit.part)}</span>
                <span class="blade-uses">${bit.totalUses} uses</span>
            </div>
            <div class="parts-list">
                ${bit.topParts.filter(pairing => pairing.ratchet !== bit.part).map((pairing, pairIndex) => `
                    <div class="part-row">
                        <span class="rank">#${pairIndex + 1}</span>
                        <span class="part-name">
                            ${toDisplayName(pairing.blade)}${pairing.ratchet ? ' + ' + toDisplayName(pairing.ratchet) : ''}
                        </span>
                        <span class="part-uses">${pairing.uses} uses</span>
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


//droptdown
function renderCurrentView() {
    const windowKey = document.querySelector('#week-tabs button.active').dataset.window;
    const sortBy = document.getElementById('sort-by').value;
    
    if (sortBy === 'bit') {
        renderBits(windowKey);
    } else {
        renderBlades(windowKey);
    }
}

function currentSourceParam() {
    const val = document.getElementById('wbax').value; // matches your <option value="...">
    return val === 'all' ? '' : `?source=${val}`;
}

document.getElementById('sort-by').addEventListener('change', renderCurrentView);
document.getElementById('wbax').addEventListener('change', loadStats);

//week buttons
document.querySelectorAll('#week-tabs button').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('#week-tabs button').forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        renderCurrentView();
    });
});




loadStats();