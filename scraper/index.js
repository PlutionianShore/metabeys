import * as cheerio from 'cheerio';

const KNOWN_FUSED_BITS = ['Operate', 'Turbo'];
const METAL_CHIPS = ['Emperor', 'Valkyrie'];
const PART_TYPES = ['Lock Chip', 'Main Blade', 'Over Blade', 'Assist Blade', 'Ratchet', 'Bit'];
const IGNORED = ['Date', 'Own', '', 'Event', 'Tournament', 'Location', 'Format', 'Ruleset', 'Notes', 'Stadium:', 'Final', 'First', '5-second', 'Out-of-bounds'];

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
            const resp = await handleSubmit(request, env, url)
            resp.headers.set("Access-Control-Allow-Origin", "*");
            return resp;
        }
        if(url.pathname === "/stats" && request.method === "GET") {
            const resp = await handleStats(env);
            resp.headers.set("Access-Control-Allow-Origin", "*");
            return resp;
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

            const bitTotal = await env.DB.prepare(`
                SELECT p.name AS bit, COUNT(*) AS uses
                FROM combos c
                JOIN combo_parts cp ON cp.combo_id = c.id
                JOIN parts p ON p.id = cp.part_id
                JOIN part_types pt ON pt.id = p.part_type_id
                WHERE pt.name = 'Bit' AND c.posted_at >= date('now', ?)
                GROUP BY p.name
                `).bind(`-${days} days`).all();

            const bitPairings = await env.DB.prepare(`
                WITH combo_bit AS (
                    SELECT c.id AS combo_id, bitp.name AS bit, b.name AS blade
                    FROM combos c
                    JOIN combo_parts bitcp ON bitcp.combo_id = c.id
                    JOIN parts bitp ON bitp.id = bitcp.part_id
                    JOIN part_types bitpt ON bitpt.id = bitp.part_type_id
                    JOIN blades b ON b.id = c.blade_id
                    WHERE bitpt.name = 'Bit' AND c.posted_at >= date('now', ?)
                ),
                other_parts AS (
                    SELECT combo_id, GROUP_CONCAT(name, ' + ') AS parts_str
                    FROM (
                        SELECT cp.combo_id AS combo_id, p.name AS name
                        FROM combo_parts cp
                        JOIN parts p ON p.id = cp.part_id
                        JOIN part_types pt ON pt.id = p.part_type_id
                        WHERE pt.name != 'Bit'
                        ORDER BY CASE pt.name
                            WHEN 'Lock Chip' THEN 1
                            WHEN 'Over Blade' THEN 2
                            WHEN 'Assist Blade' THEN 3
                            WHEN 'Ratchet' THEN 4
                            ELSE 5 END
                    )
                    GROUP BY combo_id
                )
                SELECT cb.bit, cb.blade, op.parts_str AS other_parts, COUNT(*) AS uses
                FROM combo_bit cb
                LEFT JOIN other_parts op ON op.combo_id = cb.combo_id
                GROUP BY cb.bit, cb.blade, op.parts_str
                ORDER BY cb.bit, uses DESC
                `).bind(`-${days} days`).all();

            const bitSummary = buildBitSummary(bitPairings.results, bitTotal.results);

            const bladeSummary = buildBladeSummary(byBlade.results, bladeTotals.results);

            stats[label] = { byBlade: bladeSummary, byBit: bitSummary, metaParts: metaParts.results };
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
        if (!acc[row.blade]) {
            acc[row.blade] = [];
        }
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
    })).sort((a, b) => b.totalUses - a.totalUses);
}

function buildBitSummary(byBitRows, bitTotalsRows){
    /*blade summary bit for bits, people were curious about a ranking by bit
    Exact same as bladesummary, but only returns blade and ratchet for bits.*/
    const grouped = byBitRows.reduce((acc, row) => {
        if(!acc[row.bit]) {
            acc[row.bit] = [];
        }
        acc[row.bit].push({ blade: row.blade, otherParts: row.other_parts, uses: row.uses });
        return acc
    }, {}) ;

    const totals = bitTotalsRows.reduce((acc,row) => {
        acc[row.bit] = row.uses;
        return acc;
    }, {});

    return Object.entries(grouped).map(([bitName, parts]) => ({
        part: bitName,
        totalUses: totals[bitName] || 0,
        topParts: parts.slice(0,10) 
    })).sort((a,b) => b.totalUses -a.totalUses);
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

//The big one 
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
                        try {
                            const parsed = parseCombo(comboLine.raw);
                            if (parsed.unparsed) continue; //skip things that are formatted weird

                            //figure out the blade's actual name, and pull chip category
                            //out separately if this is a CX combo
                            let bladeName = parsed.bladeToken;
                            let chipCategory = null;
                            if (parsed.isCX) {
                                ({ mainName: bladeName, chipCategory } = splitChipAndMain(parsed.bladeToken));
                            }

                            //just filtering out the ones that break it
                            if (IGNORED.includes(bladeName)) {
                                console.error(`Skipping combo: "${comboLine.raw}" — blade name "${bladeName}" ignored`);
                                continue;
                            }

                            const blade = await getOrClassifyBlade(env, bladeName, parsed.isCX);

                            //Insert the combo row
                            const insert = await env.DB.prepare(
                            `INSERT INTO combos (blade_id, posted_at, event_name, raw_text) VALUES (?, ?, ?, ?)`
                            ).bind(blade.id, eventDate, post.eventName, comboLine.raw).run();
                            const comboId = insert.meta.last_row_id;

                            //Build the list of parts used incombo
                            const partsUsed = [];
                            if (blade.is_cx) {
                                partsUsed.push([`${chipCategory} Lock Chip`, 'Lock Chip']);
                                if (parsed.bladeParts.length === 2) partsUsed.push([parsed.bladeParts[0], 'Over Blade']);
                                partsUsed.push([parsed.bladeParts[parsed.bladeParts.length - 1], 'Assist Blade']);
                            }
                            if (parsed.ratchet) partsUsed.push([parsed.ratchet, 'Ratchet']);
                            partsUsed.push([standardizePartName(parsed.bit), 'Bit']);

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
    const trimmed = raw.trim();

    //Search the string for a ratchet pattern
    const ratchetMatch = trimmed.match(/(\d+-\d+)(.*)$/);

    let bladeToken, descriptors, ratchet, bit;
    
    //if there is a ratchet, everything before is blade parts, everything after is bit.
    if (ratchetMatch) {
        const beforeRatchet = trimmed.slice(0, ratchetMatch.index).trim();
        const afterRatchet = ratchetMatch[2].trim();

        ratchet = ratchetMatch[1];
        bit = afterRatchet;

        const beforeTokens = beforeRatchet.split(/\s+/);
        bladeToken = beforeTokens[0];
        const descriptorBlob = beforeTokens.slice(1).join('');
        descriptors = descriptorBlob ? splitCapitalizedWords(descriptorBlob) : [];
    } else {
        //no ratchet, check for fused bit
        const tokens = trimmed.split(/\s+/);
        bladeToken = tokens[0];
        const rest = tokens.slice(1);
        const lastWord = rest[rest.length - 1];

        if (KNOWN_FUSED_BITS.includes(lastWord)) {
            descriptors = rest.slice(0, -1);
            ratchet = null;
            bit = lastWord;
        } else {
            descriptors = [];
            ratchet = null;
            bit = rest.join(' ').trim();
        }
    }
    let isCX = descriptors.length === 1 || descriptors.length === 2;

    //allows us to also catch if blade names are seperaed (wizard rod instead of WizardRod)
    if (isCX && !/^[A-Z][a-z]*[A-Z][a-z]*$/.test(bladeToken)) {
        bladeToken = `${bladeToken} ${descriptors[0]}`;
        descriptors = descriptors.slice(1);
        isCX = descriptors.length === 1 || descriptors.length === 2;
    }

    return { raw, bladeToken, bladeParts: descriptors, isCX, ratchet, bit};
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
async function getOrClassifyBlade(env, bladeName, isCX, bladeParts) {
    const existing = await env.DB.prepare('SELECT * FROM blades WHERE name = ?').bind(bladeName).first();
    //check if blade already exists.
    if (existing) {
        return existing; 
    }

    //if its a new blade, classify/store
    const result = await env.DB.prepare(
        'INSERT INTO blades (name, is_cx) VALUES (?, ?)'
    ).bind(bladeName, isCX ? 1 : 0).run();

    return { id: result.meta.last_row_id, is_cx: isCX ? 1 : 0 };
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

//make everything standard usable format
function standardizePartName(raw) {
    return raw.trim().split(/\s+/)
        .map(word => word[0].toUpperCase() + word.slice(1))
        .join('');
}


async function insertCombo(env, { bladeToken, bladeParts, isCX, ratchet, bit, source, postedAt, eventName, rawText }) {
    /*trying this as a way to split up handle submit cause rn it would only do WBO */
    let bladeName = bladeToken;
    let chipCategory = null;
    if (isCX) {
        ({ mainName: bladeName, chipCategory } = splitChipAndMain(bladeToken));
    }

    if (IGNORED.includes(bladeName)) {
        throw new Error(`blade name "${bladeName}" ignored`);
    }

    const blade = await getOrClassifyBlade(env, bladeName, isCX);

    const insert = await env.DB.prepare(
        `INSERT INTO combos (blade_id, posted_at, event_name, raw_text, source) VALUES (?, ?, ?, ?, ?)`
    ).bind(blade.id, postedAt, eventName, rawText, source).run();
    const comboId = insert.meta.last_row_id;

    const partsUsed = [];
    if (blade.is_cx) {
        partsUsed.push([`${chipCategory} Lock Chip`, 'Lock Chip']);
        if (bladeParts.length === 2) partsUsed.push([bladeParts[0], 'Over Blade']);
        partsUsed.push([bladeParts[bladeParts.length - 1], 'Assist Blade']);
    }
    if (ratchet) partsUsed.push([ratchet, 'Ratchet']);
    partsUsed.push([standardizePartName(bit), 'Bit']);

    for (const [name, type] of partsUsed) {
        const partId = await getOrCreatePart(env, name, type);
        await env.DB.prepare(`INSERT INTO combo_parts (combo_id, part_id) VALUES (?, ?)`).bind(comboId, partId).run();
    }

    return comboId;
}


//seoerate abd add soaces
function toDisplayName(joined) {
    return joined.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function splitCapitalizedWords(str) {
    return str.replace(/\s+/g, '').split(/(?=[A-Z])/).filter(Boolean);
}