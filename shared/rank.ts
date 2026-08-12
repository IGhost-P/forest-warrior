/** 랭킹 병합·검증 순수 로직 — 게임 클라이언트와 Worker가 공유한다. */

export interface RankEntry {
	name: string;
	score: number;
	wave: number;
	ts: number;
}

export const MAX_NAME = 12;
export const MAX_SCORE = 10_000_000;
export const MAX_WAVE = 1000;
export const TOP_CAP = 100;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** 앞뒤 공백 제거 + 제어문자 제거, 1~12자만 허용 */
export function sanitizeName(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const name = raw.replace(CONTROL_CHARS, '').trim();
	if (name.length < 1 || name.length > MAX_NAME) return null;
	return name;
}

export function validateEntry(body: unknown, now: number): RankEntry | null {
	if (typeof body !== 'object' || body === null) return null;
	const b = body as Record<string, unknown>;
	const name = sanitizeName(b.name);
	if (!name) return null;
	const score = typeof b.score === 'number' && Number.isFinite(b.score) ? Math.floor(b.score) : NaN;
	if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return null;
	const wave = typeof b.wave === 'number' && Number.isFinite(b.wave) ? Math.floor(b.wave) : 0;
	if (wave < 0 || wave > MAX_WAVE) return null;
	return { name, score, wave, ts: now };
}

/** 점수 내림차순(동점이면 먼저 등록한 쪽 우선)으로 병합 후 상위 cap개 유지 */
export function mergeEntries(list: RankEntry[], entry: RankEntry, cap: number = TOP_CAP): RankEntry[] {
	const next = [...list, entry];
	next.sort((a, b) => (b.score - a.score) || (a.ts - b.ts));
	return next.slice(0, cap);
}

/** 병합된 리스트에서 해당 엔트리의 1-기반 순위. 잘려나갔으면 null */
export function rankOf(list: RankEntry[], entry: RankEntry): number | null {
	const i = list.findIndex(e => e.name === entry.name && e.score === entry.score && e.ts === entry.ts);
	return i === -1 ? null : i + 1;
}
