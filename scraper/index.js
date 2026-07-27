export default {
    async fetch(request, env, ctx) {
        const result = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        return new Response(JSON.stringify(result.results), {
            headers: { "Content-Type": "application/json" }
        });
    }
};