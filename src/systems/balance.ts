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
	/** 능력 해금 레벨 */
	pierceLevel: 4, // 관통 화살 (1마리 관통)
	backshotLevel: 7, // 후방 화살 (60% 데미지)
	pierce2Level: 9, // 관통 2마리
	/** 궁극기 */
	ultPerKill: 10, // 처치당 게이지
	ultMax: 100,
	ultDamageMult: 6, // 공격력 × 배수
	backshotDamageRatio: 0.6,
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

/** 레벨에 따른 화살 관통 수 */
export function pierceCount(level: number): number {
	if (level >= HERO.pierce2Level) return 2;
	if (level >= HERO.pierceLevel) return 1;
	return 0;
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
	texture: 'skel' | 'boss';
	kind: MonsterKind;
	hp: number;
	damage: number;
	score: number;
	exp: number;
	speed: number;
	scale: number;
	tint: number;
	attackRange: number;
	/** 유령 해골용 반투명 */
	alpha?: number;
	/** 광폭 해골용 애니메이션 배속 */
	animRate?: number;
}

const NO_TINT = 0xffffff;
const r = Math.round;

function skel(hp: number, damage: number, score: number, exp: number, tint: number): MonsterSpec {
	return { texture: 'skel', kind: 'walker', hp, damage, score, exp, speed: 70, scale: 1, tint, attackRange: 80 };
}

function boss(hp: number, damage: number, score: number, exp: number, tint: number): MonsterSpec {
	return { texture: 'boss', kind: 'boss', hp, damage, score, exp, speed: 45, scale: 1, tint, attackRange: 150 };
}

/** 유령 해골: 반투명·푸른빛, 멈추지 않고 스쳐 지나가며 접촉 데미지 */
export function ghost(mult = 1): MonsterSpec {
	return {
		texture: 'skel', kind: 'charger',
		hp: r(45 * mult), damage: r(10 * mult), score: r(250 * mult), exp: 30,
		speed: 150, scale: 1, tint: 0x9fd8ff, alpha: 0.55, animRate: 1.4, attackRange: 0,
	};
}

/** 광폭 해골: 붉고 빠른 돌진형 */
export function berserker(mult = 1): MonsterSpec {
	return {
		texture: 'skel', kind: 'charger',
		hp: r(75 * mult), damage: r(16 * mult), score: r(350 * mult), exp: 40,
		speed: 215, scale: 1.08, tint: 0xff6b6b, animRate: 1.9, attackRange: 0,
	};
}

/** 정예 해골: 크고 느리고 단단한 워커 */
export function elite(mult = 1): MonsterSpec {
	return {
		texture: 'skel', kind: 'walker',
		hp: r(300 * mult), damage: r(20 * mult), score: r(400 * mult), exp: 60,
		speed: 45, scale: 1.45, tint: 0xd8c9a3, animRate: 0.8, attackRange: 100,
	};
}

export interface StageDef {
	mob: MonsterSpec;
	boss: MonsterSpec;
	mobCount: number;
	/** 스테이지에 섞여 나오는 정예 해골 수 */
	elites: number;
}

/** 스테이지 1~3 (0-indexed). 2·3은 몹 tint 변형 + 수치 상승 + 정예 등장 */
export const STAGES: StageDef[] = [
	{ mob: skel(60, 8, 100, 22, NO_TINT), boss: boss(600, 18, 1000, 120, NO_TINT), mobCount: 10, elites: 0 },
	{ mob: skel(110, 12, 150, 30, 0xffe066), boss: boss(1100, 26, 2000, 170, 0xffd54f), mobCount: 10, elites: 1 },
	{ mob: skel(180, 16, 220, 40, 0xff8fa3), boss: boss(1800, 34, 3000, 240, 0xff7a90), mobCount: 10, elites: 2 },
];

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
		m.hp = r(m.hp * hpM);
		m.damage = r(m.damage * dmgM);
		m.score = r(m.score * scoreM);
		specs.push(m);
	}

	const ghosts = Math.min(1 + Math.floor(n / 2), 6);
	for (let i = 0; i < ghosts; i++) specs.push(ghost(hpM));

	const berserkers = Math.min(Math.floor(n / 2), 5);
	for (let i = 0; i < berserkers; i++) specs.push(berserker(hpM));

	const elites = Math.min(Math.floor(n / 4), 3);
	for (let i = 0; i < elites; i++) specs.push(elite(hpM));

	if (n % 3 === 0) {
		const b = { ...STAGES[(Math.floor(n / 3) - 1) % 3].boss };
		b.hp = r(b.hp * hpM);
		b.damage = r(b.damage * dmgM);
		b.score = r(b.score * scoreM);
		specs.push(b);
	}

	return specs;
}
