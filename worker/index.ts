/// <reference types="@cloudflare/workers-types" />
import { mergeEntries, rankOf, validateEntry, TOP_CAP, type RankEntry } from '../shared/rank';

interface Env {
	RANK_KV: KVNamespace;
	ASSETS: Fetcher;
}

const KEY = 'top100';
const RATE_LIMIT_PER_MIN = 10;

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
	});
}

async function readList(env: Env): Promise<RankEntry[]> {
	try {
		const raw = await env.RANK_KV.get(KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export default {
	async fetch(req, env): Promise<Response> {
		const url = new URL(req.url);

		if (url.pathname === '/api/rank/top' && req.method === 'GET') {
			const n = Math.min(Math.max(parseInt(url.searchParams.get('n') ?? '10', 10) || 10, 1), TOP_CAP);
			const list = await readList(env);
			return json({ entries: list.slice(0, n) });
		}

		if (url.pathname === '/api/rank' && req.method === 'POST') {
			// IP당 분당 요청 제한 (best-effort)
			const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
			const rlKey = `rl:${ip}:${Math.floor(Date.now() / 60_000)}`;
			const count = parseInt((await env.RANK_KV.get(rlKey)) ?? '0', 10);
			if (count >= RATE_LIMIT_PER_MIN) return json({ error: 'rate_limited' }, 429);
			await env.RANK_KV.put(rlKey, String(count + 1), { expirationTtl: 120 });

			let body: unknown;
			try {
				body = await req.json();
			} catch {
				return json({ error: 'bad_json' }, 400);
			}
			const entry = validateEntry(body, Date.now());
			if (!entry) return json({ error: 'invalid_entry' }, 400);

			const list = mergeEntries(await readList(env), entry);
			await env.RANK_KV.put(KEY, JSON.stringify(list));
			return json({ rank: rankOf(list, entry) });
		}

		if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);

		// 그 외는 빌드된 정적 파일
		return env.ASSETS.fetch(req);
	},
} satisfies ExportedHandler<Env>;
