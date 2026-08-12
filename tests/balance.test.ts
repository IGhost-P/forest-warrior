import { describe, expect, it } from 'vitest';
import {
	attackDamage, berserker, elite, endlessWave, expToNext, ghost, hopper, maxHp,
	pierceCount, rollDamage, shooter, HERO, STAGES,
} from '../src/systems/balance';
import { stageSpawns, waveSpawns } from '../src/systems/WaveSpawner';

const rngStub = () => 0.5;

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

	it('관통은 레벨 구간별로 해금된다', () => {
		expect(pierceCount(1)).toBe(0);
		expect(pierceCount(HERO.pierceLevel)).toBe(1);
		expect(pierceCount(HERO.pierce2Level)).toBe(2);
	});
});

describe('rollDamage', () => {
	it('분산 범위(±10%) 안에 있고 크리티컬이 아니면 배수가 없다', () => {
		const roll = rollDamage(100, () => 0.5);
		expect(roll.crit).toBe(false);
		expect(roll.amount).toBe(100);
	});

	it('크리티컬이면 2배 적용', () => {
		let calls = 0;
		const rng = () => (calls++ === 0 ? 0.5 : 0.01);
		const roll = rollDamage(100, rng);
		expect(roll.crit).toBe(true);
		expect(roll.amount).toBe(200);
	});

	it('최소 1 데미지 보장', () => {
		const roll = rollDamage(1, () => 0);
		expect(roll.amount).toBeGreaterThanOrEqual(1);
	});
});

describe('해골 변형 몹', () => {
	it('종류별 kind가 올바르고 전부 해골 시트를 쓴다', () => {
		expect(ghost().kind).toBe('charger');
		expect(berserker().kind).toBe('charger');
		expect(elite().kind).toBe('walker');
		expect(hopper().kind).toBe('hopper');
		expect(shooter().kind).toBe('shooter');
		for (const spec of [ghost(), berserker(), elite(), hopper(), shooter()]) {
			expect(spec.texture).toBe('skel');
		}
	});

	it('유령은 반투명, 광폭은 빠르고, 정예는 크고 느리고, 저격수는 사거리가 길다', () => {
		expect(ghost().alpha).toBeLessThan(1);
		expect(berserker().speed).toBeGreaterThan(ghost().speed);
		expect(elite().scale).toBeGreaterThan(1.2);
		expect(elite().speed).toBeLessThan(70);
		expect(shooter().attackRange).toBeGreaterThan(300);
	});
});

describe('스테이지 스폰', () => {
	it('일반몹 N + 특수 해골 + 보스 1이고, 보스가 마지막이다', () => {
		for (let s = 0; s < STAGES.length; s++) {
			const def = STAGES[s];
			const orders = stageSpawns(s, rngStub);
			expect(orders).toHaveLength(def.mobCount + def.elites + def.hoppers + def.shooters + 1);
			expect(orders[orders.length - 1].spec.kind).toBe('boss');
		}
	});

	it('보스는 어떤 일반몹보다 늦게 나온다', () => {
		const orders = stageSpawns(2, rngStub);
		const bossDelay = orders[orders.length - 1].delayMs;
		for (const o of orders.slice(0, -1)) {
			expect(bossDelay).toBeGreaterThanOrEqual(o.delayMs);
		}
	});

	it('스폰 방향은 앞(1) 또는 뒤(-1)만 존재한다', () => {
		for (const o of stageSpawns(1)) {
			expect([1, -1]).toContain(o.side);
			expect(o.delayMs).toBeGreaterThanOrEqual(0);
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
			// walkers 16 + ghosts 6 + berserkers 5 + hoppers 5 + shooters 4 + elites 3 + boss 1
			expect(endlessWave(n).length).toBeLessThanOrEqual(40);
		}
	});

	it('3의 배수 웨이브에만 보스가 나온다', () => {
		for (let n = 1; n <= 12; n++) {
			const hasBoss = endlessWave(n).some(s => s.kind === 'boss');
			expect(hasBoss).toBe(n % 3 === 0);
		}
	});

	it('웨이브 2부터 돌진형이 섞인다', () => {
		expect(endlessWave(2).some(s => s.kind === 'charger')).toBe(true);
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

	it('waveSpawns: 보스는 어떤 몹보다 늦게 나오고, 방향 값이 유효하다', () => {
		const orders = waveSpawns(6, rngStub);
		const boss = orders.find(o => o.spec.kind === 'boss');
		expect(boss).toBeDefined();
		for (const o of orders) {
			expect([1, -1]).toContain(o.side);
			if (o !== boss) expect(boss!.delayMs).toBeGreaterThan(o.delayMs);
		}
	});
});
