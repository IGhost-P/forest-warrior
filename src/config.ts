export const GAME_W = 1280;
export const GAME_H = 720;

/** 한글 UI 폰트 — 시스템 폰트 스택 (PFStardust는 한글 자모 매핑이 깨져 있어 폐기) */
export const KOR_FONT = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
export const TITLE_FONT = '"LuckiestGuy", Impact, sans-serif';

/** 히어로/몬스터 발이 닿는 지면 y (near 배경의 풀밭 라인에 맞춤) */
export const GROUND_Y = 582;

export const GRAVITY_Y = 2200;

/** 스테이지별 배경 틴트 — [far, near] */
export const STAGE_TINTS: [number, number][] = [
	[0xffffff, 0xffffff], // 1: 원본
	[0xffd9a0, 0xffc878], // 2: 노을
	[0xff9db0, 0xd98ba8], // 3: 붉은 숲
];
export const ENDLESS_TINT: [number, number] = [0x8899ff, 0x7788cc]; // 밤
