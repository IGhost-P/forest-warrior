import { describe, expect, it } from 'vitest';
import { attackDamage, endlessWave, expToNext, maxHp, rollDamage, HERO, STAGES } from '../src/systems/balance';
import { stageSpawns, waveSpawns } from '../src/systems/WaveSpawner';

describe('히어로 성장 곡선', () => {
	it('레벨이 오르면 HP/공격/필요경험치가 단조 증가한다', () => {
		for (let lv = 1; lv < 50; lv++) {
			expect(maxHp(lv + 1)).toBeGreaterThan(maxHp(lv));
			expect(attackDamage(lv + 1)).toBeGreaterThan(attackDamage(lv));
			expect(expToNext(lv + 1)).toBeGreaterThan(expToNext(lv));
		}
	});

	it('레벨 1 기본값이 설계값과 일치한다', () => {
		expect(maxHp(1)).toBe(HERO.baseHp);
		expect(attackDamage(1)).toBe(HERO.baseAtk);
		expect(expToNext(1)).toBe(HERO.baseExp);
	});
});

describe('rollDamage', () => {
	it('분산 범위(±10%) 안에 있고 크리티컬이 아니면 배수가 없다', () => {
		const roll = rollDamage(100, () => 0.5); // spread=1.0, crit 판정 0.5 > 0.15 → no crit
		expect(roll.crit).toBe(false);
		expect(roll.amount).toBe(100);
	});

	it('크리티컬이면 2배 적용', () => {
		let calls = 0;
		const rng = () => (calls++ === 0 ? 0.5 : 0.01); // spread=1.0, crit=true
		const roll = rollDamage(100, rng);
		expect(roll.crit).toBe(true);
		expect(roll.amount).toBe(200);
	});

	it('최소 1 데미지 보장', () => {
		const roll = rollDamage(1, () => 0);
		expect(roll.amount).toBeGreaterThanOrEqual(1);
	});
});

describe('스테이지 스폰', () => {
	it('각 스테이지는 일반몹 N + 보스 1, 보스가 마지막이다', () => {
		for (let s = 0; s < STAGES.length; s++) {
			const orders = stageSpawns(s);
			expect(orders).toHaveLength(STAGES[s].mobCount + 1);
			expect(orders[orders.length - 1].spec.kind).toBe('boss');
			expect(orders.slice(0, -1).every(o => o.spec.kind === 'walker')).toBe(true);
		}
	});

	it('뒤 스테이지 몹이 더 강하다', () => {
		expect(STAGES[1].mob.hp).toBeGreaterThan(STAGES[0].mob.hp);
		expect(STAGES[2].mob.hp).toBeGreaterThan(STAGES[1].mob.hp);
		expect(STAGES[2].boss.damage).toBeGreaterThan(STAGES[0].boss.damage);
	});
});

describe('엔드리스 웨이브', () => {
	it('웨이브가 오를수록 몹 HP가 오르고, 수는 상한이 있다', () => {
		const w1 = endlessWave(1);
		const w10 = endlessWave(10);
		expect(w10[0].hp).toBeGreaterThan(w1[0].hp);
		for (let n = 1; n <= 60; n++) {
			expect(endlessWave(n).length).toBeLessThanOrEqual(16 + 5 + 4 + 1);
		}
	});

	it('3의 배수 웨이브에만 보스가 나온다', () => {
		for (let n = 1; n <= 12; n++) {
			const hasBoss = endlessWave(n).some(s => s.kind === 'boss');
			expect(hasBoss).toBe(n % 3 === 0);
		}
	});

	it('모든 스펙 값이 유효하다 (hp/damage/score > 0)', () => {
		for (let n = 1; n <= 30; n++) {
			for (const spec of endlessWave(n)) {
				expect(spec.hp).toBeGreaterThan(0);
				expect(spec.damage).toBeGreaterThan(0);
				expect(spec.score).toBeGreaterThan(0);
				expect(spec.speed).toBeGreaterThan(0);
			}
		}
	});

	it('waveSpawns: 돌진형은 걸어오는 몹보다 멀리서 시작한다', () => {
		const orders = waveSpawns(6);
		const walkerMax = Math.max(...orders.filter(o => o.spec.kind === 'walker').map(o => o.offset));
		const chargerMin = Math.min(...orders.filter(o => o.spec.kind === 'charger').map(o => o.offset));
		expect(chargerMin).toBeGreaterThan(0);
		expect(walkerMax).toBeLessThan(16 * 380 + 1);
	});
});
