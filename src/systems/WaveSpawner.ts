import { STAGES, elite, endlessWave, hopper, shooter, type MonsterSpec } from './balance';

export interface SpawnOrder {
	spec: MonsterSpec;
	/** 스폰 기준선에서 추가로 떨어진 px */
	offset: number;
	/** 1 = 히어로 앞(오른쪽), -1 = 뒤(왼쪽) */
	side: 1 | -1;
	/** 스폰 시점 지연 — 시간차 투입 */
	delayMs: number;
}

/** 몹 속도에 ±20% 개체차 부여 */
function jitterSpeed(spec: MonsterSpec, rng: () => number): MonsterSpec {
	return { ...spec, speed: Math.round(spec.speed * (0.85 + rng() * 0.35)) };
}

/**
 * 스테이지(0~2): 1~3마리 클러스터로 나눠 시간차 투입.
 * 두 번째 클러스터부터 30% 확률로 뒤(왼쪽)에서도 나온다. 정예는 중반, 보스는 마지막.
 */
export function stageSpawns(stage: number, rng: () => number = Math.random): SpawnOrder[] {
	const def = STAGES[stage];
	const orders: SpawnOrder[] = [];

	let placed = 0;
	let cluster = 0;
	while (placed < def.mobCount) {
		const size = Math.min(1 + Math.floor(rng() * 3), def.mobCount - placed);
		const side: 1 | -1 = cluster > 0 && rng() < 0.3 ? -1 : 1;
		const delayMs = cluster * (1500 + rng() * 1800);
		const base = rng() * 300;
		for (let i = 0; i < size; i++) {
			orders.push({
				spec: jitterSpeed(def.mob, rng),
				offset: base + i * (70 + rng() * 60),
				side,
				delayMs,
			});
			placed++;
		}
		cluster++;
	}

	for (let i = 0; i < def.elites; i++) {
		orders.push({ spec: elite(1 + stage * 0.3), offset: 150 + rng() * 250, side: 1, delayMs: 4500 + i * 5000 });
	}
	for (let i = 0; i < def.hoppers; i++) {
		orders.push({ spec: hopper(1 + stage * 0.3), offset: rng() * 200, side: rng() < 0.4 ? -1 : 1, delayMs: 2500 + i * 3500 });
	}
	for (let i = 0; i < def.shooters; i++) {
		orders.push({ spec: shooter(1 + stage * 0.3), offset: 100 + rng() * 150, side: 1, delayMs: 3500 + i * 4000 });
	}

	orders.push({ spec: { ...def.boss }, offset: 400, side: 1, delayMs: cluster * 1700 + 4500 });
	return orders;
}

/** 엔드리스 웨이브: 워커는 산발적으로, 돌진형은 양방향 기습, 보스는 마지막 */
export function waveSpawns(wave: number, rng: () => number = Math.random): SpawnOrder[] {
	return endlessWave(wave).map((spec): SpawnOrder => {
		if (spec.kind === 'boss') {
			return { spec, offset: 300, side: 1, delayMs: 8000 };
		}
		if (spec.kind === 'charger' || spec.kind === 'hopper') {
			return {
				spec: jitterSpeed(spec, rng),
				offset: rng() * 400,
				side: rng() < 0.35 ? -1 : 1,
				delayMs: 1500 + rng() * 9000,
			};
		}
		if (spec.kind === 'shooter') {
			return { spec, offset: 100 + rng() * 200, side: 1, delayMs: 2000 + rng() * 6000 };
		}
		if (spec.scale > 1.2) {
			// 정예
			return { spec, offset: rng() * 300, side: 1, delayMs: 5000 + rng() * 4000 };
		}
		return {
			spec: jitterSpeed(spec, rng),
			offset: rng() * 500,
			side: rng() < 0.25 ? -1 : 1,
			delayMs: rng() * 6000,
		};
	});
}
