import { mergeEntries, type RankEntry } from '../../shared/rank';

const LS_KEY = 'fw_local_rank';
const TIMEOUT_MS = 4000;

export interface TopResult {
	entries: RankEntry[];
	offline: boolean;
}

export interface SubmitResult {
	rank: number | null;
	offline: boolean;
}

function readLocal(): RankEntry[] {
	try {
		const parsed = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function saveLocal(entry: RankEntry): void {
	try {
		localStorage.setItem(LS_KEY, JSON.stringify(mergeEntries(readLocal(), entry, 10)));
	} catch {
		/* 저장 불가(시크릿 모드 등)면 무시 */
	}
}

export function localTop(n = 10): RankEntry[] {
	return readLocal().slice(0, n);
}

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
	try {
		return await fetch(input, { ...init, signal: ctrl.signal });
	} finally {
		clearTimeout(timer);
	}
}

/** 서버 TOP N — 실패하면 로컬 기록으로 fallback */
export async function fetchTop(n = 10): Promise<TopResult> {
	try {
		const res = await fetchWithTimeout(`/api/rank/top?n=${n}`);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = (await res.json()) as { entries: RankEntry[] };
		return { entries: data.entries ?? [], offline: false };
	} catch {
		return { entries: localTop(n), offline: true };
	}
}

/** 점수 제출 — 로컬에는 항상 저장, 서버 실패 시 offline 표시 */
export async function submitScore(name: string, score: number, wave: number): Promise<SubmitResult> {
	saveLocal({ name, score, wave, ts: Date.now() });
	try {
		const res = await fetchWithTimeout('/api/rank', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name, score, wave }),
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = (await res.json()) as { rank: number | null };
		return { rank: data.rank ?? null, offline: false };
	} catch {
		return { rank: null, offline: true };
	}
}
