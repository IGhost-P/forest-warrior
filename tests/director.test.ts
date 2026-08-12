import { describe, expect, it } from 'vitest';
import { parseBossMod, ruleBossMod, type CombatStats } from '../src/systems/director';

const stats = (over: Partial<CombatStats>): CombatStats => ({
	segmentMs: 30_000,
	damageTaken: 50,
	accuracy: 0.4,
	ultUsed: 0,
	...over,
});

describe('ruleBossMod (규칙 기반 디렉터)', () => {
	it('잘하는 플레이어(고명중·저피격)는 강하게 압박한다', () => {
		const mod = ruleBossMod(stats({ accuracy: 0.7, damageTaken: 10 }));
		expect(mod.aggression).toBe(3);
		expect(mod.hpMult).toBeGreaterThan(1);
	});

	it('고전하는 플레이어(고피격)는 완화한다', () => {
		const mod = ruleBossMod(stats({ damageTaken: 100 }));
		expect(mod.aggression).toBe(1);
		expect(mod.hpMult).toBeLessThan(1);
	});

	it('평범하면 기본값', () => {
		const mod = ruleBossMod(stats({ accuracy: 0.4, damageTaken: 50 }));
		expect(mod.aggression).toBe(2);
		expect(mod.hpMult).toBe(1);
	});
});

describe('parseBossMod (AI 응답 검증)', () => {
	it('정상 JSON 통과 + note 길이 제한', () => {
		const mod = parseBossMod('{"aggression":3,"summonBias":2,"chargeBias":1,"hpMult":1.2,"note":"아주아주아주아주 긴 문장은 잘려야 한다"}');
		expect(mod).not.toBeNull();
		expect(mod!.aggression).toBe(3);
		expect(mod!.note.length).toBeLessThanOrEqual(24);
	});

	it('범위 밖 값은 클램프', () => {
		const mod = parseBossMod('{"aggression":9,"summonBias":-3,"chargeBias":1,"hpMult":5,"note":""}');
		expect(mod!.aggression).toBe(3);
		expect(mod!.summonBias).toBe(0);
		expect(mod!.hpMult).toBe(1.4);
	});

	it('앞뒤에 잡담이 섞여도 JSON만 뽑아낸다', () => {
		const mod = parseBossMod('알겠습니다! {"aggression":2,"summonBias":1,"chargeBias":0,"hpMult":1,"note":"온다"} 이렇게요.');
		expect(mod).not.toBeNull();
		expect(mod!.chargeBias).toBe(0);
	});

	it('깨진 응답은 null', () => {
		expect(parseBossMod('그냥 어렵게 하세요')).toBeNull();
		expect(parseBossMod('{"aggression":"셋"}')).toBeNull();
	});
});
