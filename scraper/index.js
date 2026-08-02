import * as cheerio from 'cheerio';

const KNOWN_FUSED_BITS = ['Operate', 'Turbo'];
const METAL_CHIPS = ['Emperor', 'Valkyrie'];
const PART_TYPES = ['Lock Chip', 'Main Blade', 'Over Blade', 'Assist Blade', 'Ratchet', 'Bit'];

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);   
        if(request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type"
                }
            });
        }
        if(url.pathname === "/submit" && request.method === "POST") {
            const resp = await handleSubmit(request, env)
            resp.headers.set("Access-Control-Allow-Origin", "*");
            return resp;
        }
        if(url.pathname === "/stats" && request.method === "GET") {
            return handleStats(env)
        }

        return new Response("Not Found", { status: 404 });
    }
}

async function handleStats(env) {
    try {
        const windows = { week1: 7, week2: 14, week4: 28};
        const stats = {};

        for (const [label, days] of Object.entries(windows)) {
            const byBlade = await env.DB.prepare(`
                SELECT b.name AS blade, pt.name AS part_type, p.name AS part, COUNT(*) AS uses
                FROM combos c
                JOIN combo_parts cp ON cp.combo_id = c.id
                JOIN parts p ON p.id = cp.part_id
                JOIN part_types pt ON pt.id = p.part_type_id
                JOIN blades b ON b.id = c.blade_id
                WHERE c.posted_at >= date('now', ?)
                GROUP BY b.name, pt.name, p.name
                ORDER BY b.name, uses DESC
            `).bind(`-${days} days`).all();

            const bladeTotals = await env.DB.prepare(`
                SELECT b.name AS blade, COUNT(*) AS uses
                FROM combos c
                JOIN blades b ON b.id = c.blade_id
                WHERE c.posted_at >= date('now', ?)
                GROUP BY b.name
            `).bind(`-${days} days`).all();

            const metaParts = await env.DB.prepare(`
                SELECT pt.name AS part_type, p.name AS part, COUNT(*) AS uses
                FROM combos c
                JOIN combo_parts cp ON cp.combo_id = c.id
                JOIN parts p ON p.id = cp.part_id
                JOIN part_types pt ON pt.id = p.part_type_id
                WHERE c.posted_at >= date('now', ?)
                GROUP BY pt.name, p.name
                ORDER BY uses DESC
            `).bind(`-${days} days`).all();

            const bladeSummary = buildBladeSummary(byBlade.results, bladeTotals.results);
            stats[label] = {byBlade: bladeSummary, metaParts: metaParts.results }

        }

        return new Response(JSON.stringify(stats, null, 2), {headers: { "Content-Type": "application/json" }});
    }
    
    catch (error) {
        return new Response('Error retrieving stats: ' + error.message, { status: 500 });
    }
}   


function buildBladeSummary(byBladeRows, bladeTotalsRows) {
    //group the rows by blade name
    const grouped = byBladeRows.reduce((acc, row) => {
        if (!acc[row.blade]) acc[row.blade] = [];
        acc[row.blade].push({ part_type: row.part_type, part: row.part, uses: row.uses });
        return acc;
    }, {});

    //get total uses
    const totals = bladeTotalsRows.reduce((acc, row) => {
        acc[row.blade] = row.uses;
        return acc;
    }, {});

    //create top 10
    return Object.entries(grouped).map(([bladeName, parts]) => ({
        blade: bladeName,
        totalUses: totals[bladeName] || 0,
        topParts: parts.slice(0, 10)
    }));
}

function parsePost($, el) {
    const postId = $(el).attr('id');
    
    //turn <br> and <hr> into /n and ---
    let inner = $.html(el)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<hr[^>]*>/gi, '\n---\n');

    //strip tags
    const rawText = cheerio.load(inner).root().text();

    //split into lines
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l && l !== '---');

    const post = { postId, eventName: lines[0], meta: {}, placements: [] };
    const placementRegex = /^(\d+)(st|nd|rd|th)\s+(.+)$/i;
    let current = null;

    //sorting every line
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const placementMatch = line.match(placementRegex);

        if (placementMatch) {
            //playernamde block
            current = { combos: [] };
            post.placements.push(current);
            continue;
        }

        if (current) {
            //pull combo out of placement block
            const comboMatch = line.match(/^(.+?)\s*\([^)]+\)$/);
            if (comboMatch) current.combos.push({ raw: comboMatch[1].trim() });
        } else {
            //if in header still.
            const [key, ...rest] = line.split(':');
            if (rest.length) post.meta[key.trim()] = rest.join(':').trim();
        }
    }

    return post;
}

async function handleSubmit(request, env) {
    /*
        handles submitting requests, returns pared JSON
        when finished should write to DB as well
    */
    try {
        //get raw html, load int cheerio
        const html = await request.text();
        const $ = cheerio.load(html);

        //Loop through every post on the page
        for (const element of $('.post_body').toArray()) {
            try {
                const post = parsePost($, element);

                //checking if processed
                const alreadyProcessed = await env.DB.prepare(`SELECT post_id FROM processed_posts WHERE post_id = ?`).bind(post.postId).first();

                if (alreadyProcessed) {
                    console.error(`Skipping post ${post.postId} — already processed`);
                    continue;
                }

                if (!post.meta['Date']) {
                    console.error(`Skipping post: no Date field`);
                    continue;
                }

                const eventDate = toISODate(post.meta['Date']);

                //Loop through every combo
                for (const placement of post.placements) {
                    for (const comboLine of placement.combos) {
                        try {const parsed = parseCombo(comboLine.raw);
                            if (parsed.unparsed) continue; //skip things that are formatted weird

                            const blade = await getOrClassifyBlade(env, parsed.bladeToken, parsed.isCX, parsed.bladeParts);

                            //Insert the combo row
                            const insert = await env.DB.prepare(
                            `INSERT INTO combos (blade_id, posted_at, event_name, raw_text) VALUES (?, ?, ?, ?)`
                            ).bind(blade.id, eventDate, post.eventName, comboLine.raw).run();
                            const comboId = insert.meta.last_row_id;

                            //Build the list of parts used incombo
                            const partsUsed = [];
                            if (blade.is_cx) {
                                partsUsed.push([`${blade.chip_category} Lock Chip`, 'Lock Chip']);
                                partsUsed.push([blade.main_name, 'Main Blade']);
                            if (parsed.bladeParts.length === 2) partsUsed.push([parsed.bladeParts[0], 'Over Blade']);
                                partsUsed.push([parsed.bladeParts[parsed.bladeParts.length - 1], 'Assist Blade']);
                            }
                            if (parsed.ratchet) partsUsed.push([parsed.ratchet, 'Ratchet']);
                                partsUsed.push([parsed.bit, 'Bit']);

                            //Link every part to this combo
                            for (const [name, type] of partsUsed) {
                                const partId = await getOrCreatePart(env, name, type);
                                await env.DB.prepare(`INSERT INTO combo_parts (combo_id, part_id) VALUES (?, ?)`).bind(comboId, partId).run();
                            }
                        }
                        catch (error) {
                            console.error(`Failed on combo: "${comboLine.raw}" — ${error.message}`);
                        }
                    }
                }

                await env.DB.prepare(`INSERT INTO processed_posts (post_id) VALUES (?)`).bind(post.postId).run();

            } catch (error) {
                console.error(`Failed on post: ${error.message}`);
            }
        }

        return new Response("Inserted successfully");
    } catch (error) { 
        return new Response(`Error processing request: ${error.message}`, { status: 500 });
    }
}

function parseComboString(raw, notation) {
    //splits up combo, outliers or mistakes are marked as unparsed
    const match = raw.match(/^(\S+)\s+(\d+-\d+)(.+)$/);
    if (!match) return { raw, notation, unparsed: true };
    return { blade: match[1], ratchet: match[2], bit: match[3].trim(), notation } ;
}

function parseCombo(raw) {
    const tokens = raw.trim().split(/\s+/);
    let bladeToken = tokens[0];
    const rest = tokens.slice(1);

    //find ratchet
    const ratchetIndex = rest.findIndex(t => /\d+-\d+/.test(t));

    let bladeParts, ratchet, bit;
    
    //if there is a ratchet, everything before is blade parts, everything after is bit.
    if (ratchetIndex !== -1) {
        bladeParts = rest.slice(0, ratchetIndex);
        const match = rest[ratchetIndex].match(/^(\d+-\d+)(.*)$/);
        if (!match) return { raw, unparsed: true }; //gaurd

        ratchet = match[1];
        const bitEnd = rest.slice(ratchetIndex + 1).join(' ').trim();
        bit = (match[2] + (bitEnd ? ' ' + bitEnd : '')).trim();
    } else {
        //no ratchet, check for fused bit
        const lastWord = rest[rest.length - 1];
        if (KNOWN_FUSED_BITS.includes(lastWord)) {
            bladeParts = rest.slice(0, -1);
            ratchet = null;
            bit = lastWord;
        } else {
            //no ratchet, no fused bit, UX expanded
            bladeParts = [];
            ratchet = null;
            bit = rest.join(' ').trim();
        }
    }
    let isCX = bladeParts.length === 1 || bladeParts.length === 2;

    //allows us to also catch if blade names are seperaed (wizard rod instead of WizardRod)
    if (isCX && !/^[A-Z][a-z]*[A-Z][a-z]*$/.test(bladeToken)) {
        bladeToken = `${bladeToken} ${bladeParts[0]}`;
        bladeParts = bladeParts.slice(1);
        isCX = bladeParts.length === 1 || bladeParts.length === 2;
    }

    return {bladeToken, bladeParts, isCX, ratchet, bit};
}

//splits chip from blade in CX
function splitChipAndMain(bladeToken) {
    const match = bladeToken.match(/^([A-Z][a-z]*)([A-Z][a-z]*)$/);
    const chipName = match[1];
    const mainName = match[2];
    const chipCategory = METAL_CHIPS.includes(chipName) ? 'Metal' : 'Plastic';
    return { mainName, chipCategory }
}

//tool for storing new blades.
async function getOrClassifyBlade(env, bladeToken, isCX, bladeParts) {
    const existing = await env.DB.prepare('SELECT * FROM blades WHERE name = ?').bind(bladeToken).first();
    if (existing) return existing; //check if blade already exists.

    //if its a new blade, classify/store
    let mainName = null, chipCategory = null;
    if (isCX) {
        ({ mainName, chipCategory } = splitChipAndMain(bladeToken));
    }

    const result = await env.DB.prepare(
        'INSERT INTO blades (name, is_CX, main_name, chip_category) VALUES (?, ?, ?, ?)'
    ).bind(bladeToken, isCX ? 1 : 0, mainName, chipCategory).run();

    return { id: result.meta.last_row_id, is_cx: isCX ? 1 : 0, main_name : mainName,chip_category: chipCategory };
}

//Finds an existing part type or creates it if missing, returns ID
async function getOrCreatePartType(env, typeName) {
  const existing = await env.DB.prepare(`SELECT id FROM part_types WHERE name = ?`).bind(typeName).first();
  if (existing) return existing.id;

  const result = await env.DB.prepare(`INSERT INTO part_types (name) VALUES (?)`).bind(typeName).run();
  return result.meta.last_row_id;
}

//Finds an existing part by name+type, or creates it if missing, returns its ID
async function getOrCreatePart(env, name, typeName) {
  const typeId = await getOrCreatePartType(env, typeName);

  const existing = await env.DB.prepare(`SELECT id FROM parts WHERE name = ? AND part_type_id = ?`).bind(name, typeId).first();
  if (existing) return existing.id;

  const result = await env.DB.prepare(`INSERT INTO parts (name, part_type_id) VALUES (?, ?)`).bind(name, typeId).run();
  return result.meta.last_row_id;
}

function toISODate(dateString) {
    const [month, day, year] = dateString.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

//Actually creating stats table
async function getStats(env, days) {
    const result = await env.DB.prepare(`
        SELECT b.name AS blade, pt.name AS part_type, p.name AS part, COUNT(*) AS uses
        FROM combos c
        JOIN combo_parts cp ON cp.combo_id = c.id
        JOIN parts p ON p.id = cp.part_id
        JOIN part_types pt ON pt.id = p.part_type_id
        JOIN blades b ON b.id = c.blade_id
        WHERE c.posted_at >= date('now', ?)
        GROUP BY b.name, pt.name, p.name
        ORDER BY b.name, uses DESC
    `).bind(`-${days} days`).all();

    return result.results;
}


