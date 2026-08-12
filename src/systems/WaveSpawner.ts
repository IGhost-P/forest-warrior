import { STAGES, endlessWave, type MonsterSpec } from './balance';

export interface SpawnOrder {
	spec: MonsterSpec;
	/** 스폰 기준선(히어로 앞 화면 밖)에서 추가로 떨어진 px */
	offset: number;
}

/** 스테이지(0~2): 일반몹 N + 마지막에 보스 */
export function stageSpawns(stage: number): SpawnOrder[] {
	const def = STAGES[stage];
	const orders: SpawnOrder[] = [];
	for (let i = 0; i < def.mobCount; i++) {
		orders.push({ spec: { ...def.mob }, offset: i * 450 });
	}
	orders.push({ spec: { ...def.boss }, offset: def.mobCount * 450 + 300 });
	return orders;
}

/** 엔드리스 웨이브: 돌진형은 멀리 흩뿌려 시차를 두고 도착 */
export function waveSpawns(wave: number): SpawnOrder[] {
	const specs = endlessWave(wave);
	let walkerIdx = 0;
	let chargerIdx = 0;
	return specs.map(spec => {
		if (spec.kind === 'charger') {
			return { spec, offset: 900 + chargerIdx++ * 950 };
		}
		if (spec.kind === 'boss') {
			return { spec, offset: 500 };
		}
		return { spec, offset: walkerIdx++ * 380 };
	});
}
