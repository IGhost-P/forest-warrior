/**
 * AI 보스 디렉터 — 플레이어의 전투 데이터를 보고 보스의 성향·난이도를 조절한다.
 * Chrome 내장 AI(Prompt API, Gemini Nano)가 있으면 판단을 맡기고,
 * 없거나 느리면 규칙 기반으로 결정한다. 어떤 경우에도 게임을 막지 않는다.
 */
import { DEFAULT_BOSS_MOD, type BossMod } from './balance';

export interface CombatStats {
	/** 이번 구간(스테이지/웨이브) 경과 ms */
	segmentMs: number;
	/** 받은 피해 총량 */
	damageTaken: number;
	/** 명중률 0~1 */
	accuracy: number;
	/** 궁극기 사용 횟수 */
	ultUsed: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 규칙 기반 fallback — 잘하면 압박, 고전하면 완화 */
export function ruleBossMod(stats: CombatStats): BossMod {
	const skilled = stats.accuracy >= 0.5 && stats.damageTaken <= 30;
	const struggling = stats.damageTaken >= 70 || stats.accuracy < 0.25;

	if (skilled) {
		return { aggression: 3, summonBias: 2, chargeBias: 2, hpMult: 1.3, note: '보스가 전력을 다한다!' };
	}
	if (struggling) {
		return { aggression: 1, summonBias: 0, chargeBias: 1, hpMult: 0.85, note: '보스가 방심하고 있다...' };
	}
	return { ...DEFAULT_BOSS_MOD, note: '보스가 검을 겨눈다' };
}

/** AI 응답(JSON)을 검증·클램프. 형식이 어긋나면 null */
export function parseBossMod(raw: string): BossMod | null {
	try {
		const match = raw.match(/\{[\s\S]*\}/);
		if (!match) return null;
		const obj = JSON.parse(match[0]) as Record<string, unknown>;
		const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
		const aggression = clamp(Math.round(num(obj.aggression)), 1, 3);
		const summonBias = clamp(Math.round(num(obj.summonBias)), 0, 2);
		const chargeBias = clamp(Math.round(num(obj.chargeBias)), 0, 2);
		const hpMult = clamp(num(obj.hpMult), 0.8, 1.4);
		if ([aggression, summonBias, chargeBias, hpMult].some(Number.isNaN)) return null;
		const note = typeof obj.note === 'string' ? obj.note.trim().slice(0, 24) : '';
		return { aggression, summonBias, chargeBias, hpMult, note };
	} catch {
		return null;
	}
}

let session: { prompt: (text: string) => Promise<string> } | null = null;
let unavailable = false;

async function aiBossMod(stats: CombatStats): Promise<BossMod | null> {
	if (unavailable) return null;
	const g = globalThis as Record<string, any>;
	const LM = g.LanguageModel ?? g.ai?.languageModel;
	if (!LM) {
		unavailable = true;
		return null;
	}
	try {
		if (!session) {
			session = LM.create ? await LM.create() : await LM.createTextSession?.();
		}
		if (!session) {
			unavailable = true;
			return null;
		}
		const out = await session.prompt(
			`너는 2D 액션 게임의 보스 난이도 디렉터다. 플레이어의 직전 구간 데이터:
- 소요 시간: ${Math.round(stats.segmentMs / 1000)}초
- 받은 피해: ${stats.damageTaken}
- 명중률: ${Math.round(stats.accuracy * 100)}%
- 궁극기 사용: ${stats.ultUsed}회

잘하는 플레이어는 강하게 압박하고, 고전하는 플레이어에게는 숨 돌릴 틈을 줘라.
아래 형식의 JSON 하나만 출력해라 (설명 금지):
{"aggression":1|2|3,"summonBias":0|1|2,"chargeBias":0|1|2,"hpMult":0.8~1.4,"note":"한국어 12자 이내 경고 문구"}`,
		);
		return parseBossMod(String(out));
	} catch {
		session = null;
		return null;
	}
}

/** 2.5초 안에 AI 판단이 안 나오면 규칙 기반 사용 */
export async function bossDirector(stats: CombatStats): Promise<BossMod> {
	const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 2500));
	const result = await Promise.race([aiBossMod(stats), timeout]);
	return result ?? ruleBossMod(stats);
}
