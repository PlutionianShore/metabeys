import * as cheerio from 'cheerio';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        if (url.pathname === "/submit" && request.method === "POST") {
            return handleSubmit(request, env);
        }

        return new Response("Not Found", { status: 404 });
    }
};


async function handleSubmit(request, env) {
    /*
        handles submitting requests, returns pared JSON
        when finished should write to DB as well
    */
    try {
        //get raw html, load int cheerio, set up array for parsing
        const html = await request.text();
        const $ = cheerio.load(html);
        const results = [];

        //get post boddies from forum.
        $('.post_body').each((index, element) => {
            const postId = $(element).attr('id');

            //convert the weird dividers into \n or ---
            let inner = $.html(element)
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/?[^>]+(>|$)/g, '\n---\n').trim();

            //get raw text without tags, split lines + trim
            const rawText = inner.replace(/\n+/g, ' ').trim();
            const lines = rawText.split('\n').map(l => l.trim()).filter(l => l && l !== '---');

            //post object
            const post = {
                id: postId,
                eventName: lines[0],
                meta: {},
                placements: []
            };

            const placementRegex = /^(\d+)(st|nd|rd|th)\s+(.+)$/i;
            let current = null;

            for (let i2 = 1; i2 < lines.length; i2++) {
                const line = lines[i2].trim();
                const placementMatch = line.match(placementRegex);
                
                if (placementMatch) {
                    //new entry for player placement + move on
                    current = {
                        placement: parseInt(placementMatch[1]), 
                        player: placementMatch[3].trim(), 
                        combos: []
                    };
                    post.placements.push(current);
                    continue;
                }

                if (current) {
                    //grab combos from current player placement
                    const comboMatch = line.match(/^(.+?)\s*\(([^)]+)\)$/);
                    if (comboMatch) {
                        current.combos.push(parseComboString(comboMatch[1].trim(), comboMatch[2].trim()));
                    }
                } else {
                    const [key, ...rest] = line.split(':');
                    if (rest.length) post.meta[key.trim()] = rest.join(':').trim();
                }
            }

            results.push(post);
        });
        
        //send back JSON
        return new Response(JSON.stringify(results, null, 2), {headers: { "Content-Type": "application/json" }});
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