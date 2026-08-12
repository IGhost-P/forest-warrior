import { describe, expect, it } from 'vitest';
import { mergeEntries, rankOf, sanitizeName, validateEntry, MAX_SCORE, type RankEntry } from '../shared/rank';

const e = (name: string, score: number, ts = 0): RankEntry => ({ name, score, wave: 0, ts });

describe('sanitizeName', () => {
	it('정상 이름은 트림해서 통과', () => {
		expect(sanitizeName('  용사YSW ')).toBe('용사YSW');
	});
	it('제어문자는 제거된다', () => {
		expect(sanitizeName('ab\u0007c')).toBe('abc');
	});
	it('빈 문자열/공백만/비문자열/13자 초과는 null', () => {
		expect(sanitizeName('')).toBeNull();
		expect(sanitizeName('   ')).toBeNull();
		expect(sanitizeName(123)).toBeNull();
		expect(sanitizeName('a'.repeat(13))).toBeNull();
	});
});

describe('validateEntry', () => {
	it('정상 엔트리 통과 + ts 스탬프', () => {
		const entry = validateEntry({ name: 'YSW', score: 1234, wave: 3 }, 999);
		expect(entry).toEqual({ name: 'YSW', score: 1234, wave: 3, ts: 999 });
	});
	it('점수 소수는 내림, 음수/상한 초과/NaN은 거부', () => {
		expect(validateEntry({ name: 'a', score: 10.9, wave: 0 }, 0)?.score).toBe(10);
		expect(validateEntry({ name: 'a', score: -1, wave: 0 }, 0)).toBeNull();
		expect(validateEntry({ name: 'a', score: MAX_SCORE + 1, wave: 0 }, 0)).toBeNull();
		expect(validateEntry({ name: 'a', score: Number.NaN, wave: 0 }, 0)).toBeNull();
		expect(validateEntry({ name: 'a', score: '100', wave: 0 }, 0)).toBeNull();
	});
	it('wave 누락 시 0으로 처리', () => {
		expect(validateEntry({ name: 'a', score: 1 }, 0)?.wave).toBe(0);
	});
	it('객체가 아니면 거부', () => {
		expect(validateEntry(null, 0)).toBeNull();
		expect(validateEntry('x', 0)).toBeNull();
	});
});

describe('mergeEntries', () => {
	it('점수 내림차순 정렬', () => {
		const list = mergeEntries([e('a', 100), e('b', 300)], e('c', 200));
		expect(list.map(x => x.name)).toEqual(['b', 'c', 'a']);
	});
	it('동점이면 먼저 등록(ts 작은 쪽)이 위', () => {
		const list = mergeEntries([e('old', 100, 1)], e('new', 100, 2));
		expect(list[0].name).toBe('old');
	});
	it('cap을 넘으면 잘린다', () => {
		let list: RankEntry[] = [];
		for (let i = 0; i < 120; i++) list = mergeEntries(list, e(`p${i}`, i, i));
		expect(list).toHaveLength(100);
		expect(list[0].score).toBe(119);
		expect(list[99].score).toBe(20);
	});
});

describe('rankOf', () => {
	it('병합 후 자기 순위 반환 (1-기반)', () => {
		const mine = e('me', 200, 5);
		const list = mergeEntries([e('a', 300), e('b', 100)], mine);
		expect(rankOf(list, mine)).toBe(2);
	});
	it('cap에 밀려나면 null', () => {
		let list: RankEntry[] = [];
		for (let i = 0; i < 100; i++) list = mergeEntries(list, e(`p${i}`, 1000 + i, i));
		const mine = e('me', 1, 999);
		list = mergeEntries(list, mine);
		expect(rankOf(list, mine)).toBeNull();
	});
});
