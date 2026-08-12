/**
 * 게임 수치 밸런스 — 전부 여기서만 조정한다.
 * 원작의 디버그 값(HP 1,000,000)을 폐기하고 죽을 수 있는 곡선으로 재설계.
 */

export const HERO = {
	baseHp: 100,
	hpPerLevel: 20,
	baseAtk: 30,
	atkPerLevel: 6,
	speed: 270,
	jumpVelocity: -880,
	fireCooldownMs: 320,
	bulletSpeed: 950,
	critChance: 0.15,
	critMult: 2,
	variance: 0.1,
	invulnMs: 800,
	baseExp: 60,
	expGrowth: 30,
} as const;

export function maxHp(level: number): number {
	return HERO.baseHp + HERO.hpPerLevel * (level - 1);
}

export function attackDamage(level: number): number {
	return HERO.baseAtk + HERO.atkPerLevel * (level - 1);
}

export function expToNext(level: number): number {
	return HERO.baseExp + HERO.expGrowth * (level - 1);
}

export interface DamageRoll {
	amount: number;
	crit: boolean;
}

/** 공격 데미지에 ±variance 분산과 크리티컬을 적용 */
export function rollDamage(base: number, rng: () => number = Math.random): DamageRoll {
	const spread = 1 - HERO.variance + rng() * HERO.variance * 2;
	const crit = rng() < HERO.critChance;
	return { amount: Math.max(1, Math.round(base * spread * (crit ? HERO.critMult : 1))), crit };
}

export type MonsterKind = 'walker' | 'boss' | 'charger';

export interface MonsterSpec {
	texture: 'skel' | 'boss' | 'dino_pink' | 'dino_yellow' | 'dino_green' | 'zombie';
	kind: MonsterKind;
	hp: number;
	damage: number;
	score: number;
	exp: number;
	speed: number;
	scale: number;
	tint: number;
	attackRange: number;
}

const NO_TINT = 0xffffff;

function skel(hp: number, damage: number, score: number, exp: number, tint: number): MonsterSpec {
	return { texture: 'skel', kind: 'walker', hp, damage, score, exp, speed: 70, scale: 1, tint, attackRange: 80 };
}

function boss(hp: number, damage: number, score: number, exp: number, tint: number): MonsterSpec {
	return { texture: 'boss', kind: 'boss', hp, damage, score, exp, speed: 45, scale: 1, tint, attackRange: 150 };
}

export interface StageDef {
	mob: MonsterSpec;
	boss: MonsterSpec;
	mobCount: number;
}

/** 스테이지 1~3 (0-indexed). 2·3은 몹 tint 변형 + 수치 상승 */
export const STAGES: StageDef[] = [
	{ mob: skel(60, 8, 100, 22, NO_TINT), boss: boss(600, 18, 1000, 120, NO_TINT), mobCount: 10 },
	{ mob: skel(110, 12, 150, 30, 0xffe066), boss: boss(1100, 26, 2000, 170, 0xffd54f), mobCount: 10 },
	{ mob: skel(180, 16, 220, 40, 0xff8fa3), boss: boss(1800, 34, 3000, 240, 0xff7a90), mobCount: 10 },
];

const DINOS = ['dino_pink', 'dino_yellow', 'dino_green'] as const;

/** 엔드리스 웨이브 n(1부터)의 스폰 스펙. 수·체력·데미지·점수가 함께 오른다 */
export function endlessWave(n: number): MonsterSpec[] {
	const hpM = 1 + 0.22 * n;
	const dmgM = 1 + 0.1 * n;
	const scoreM = 1 + 0.15 * n;
	const specs: MonsterSpec[] = [];

	const base = STAGES[(n - 1) % 3];
	const walkers = Math.min(6 + n, 16);
	for (let i = 0; i < walkers; i++) {
		const m = { ...base.mob };
		m.hp = Math.round(m.hp * hpM);
		m.damage = Math.round(m.damage * dmgM);
		m.score = Math.round(m.score * scoreM);
		specs.push(m);
	}

	const dinoCount = Math.min(1 + Math.floor(n / 2), 5);
	for (let i = 0; i < dinoCount; i++) {
		specs.push({
			texture: DINOS[i % 3],
			kind: 'charger',
			hp: Math.round(80 * hpM),
			damage: Math.round(14 * dmgM),
			score: Math.round(300 * scoreM),
			exp: 35,
			speed: 200,
			scale: 0.26,
			tint: NO_TINT,
			attackRange: 0,
		});
	}

	const zombieCount = Math.min(Math.floor(n / 3), 4);
	for (let i = 0; i < zombieCount; i++) {
		specs.push({
			texture: 'zombie',
			kind: 'charger',
			hp: Math.round(140 * hpM),
			damage: Math.round(20 * dmgM),
			score: Math.round(450 * scoreM),
			exp: 50,
			speed: 160,
			scale: 0.24,
			tint: NO_TINT,
			attackRange: 0,
		});
	}

	if (n % 3 === 0) {
		const b = { ...STAGES[(Math.floor(n / 3) - 1) % 3].boss };
		b.hp = Math.round(b.hp * hpM);
		b.damage = Math.round(b.damage * dmgM);
		b.score = Math.round(b.score * scoreM);
		specs.push(b);
	}

	return specs;
}
