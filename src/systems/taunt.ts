/**
 * 보스 도발 대사 — Chrome 내장 AI(Prompt API, Gemini Nano)가 있으면 즉석 생성,
 * 없거나 느리면 준비된 대사로 fallback. 어떤 경우에도 게임을 막지 않는다.
 */

const FALLBACKS = [
	'{nick}, 뼈도 못 추릴 줄 알아라!',
	'감히 내 숲에 발을 들여, {nick}?',
	'네 화살로는 날 못 꿰뚫는다!',
	'덜그럭... 오늘 저녁거리는 {nick}이군!',
	'도망칠 마지막 기회다, 꼬마야!',
	'내 검이 오랜만에 신났구나!',
	'{nick}... 그 이름, 묘비에 새겨주마!',
];

let session: { prompt: (text: string) => Promise<string> } | null = null;
let unavailable = false;

async function promptOnce(nick: string): Promise<string | null> {
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
			`너는 픽셀 게임의 해골 보스다. 침입자 "${nick}"에게 던질 우스꽝스러운 한국어 도발 한 문장(25자 이내)만 출력해라. 따옴표나 설명 없이 문장만.`,
		);
		const line = String(out).trim().split('\n')[0].slice(0, 40);
		return line || null;
	} catch {
		session = null;
		return null;
	}
}

function fallback(nick: string): string {
	return FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)].replace('{nick}', nick);
}

/** 3.5초 안에 AI 대사가 안 나오면 준비된 대사 사용 */
export async function bossTaunt(nick: string): Promise<string> {
	const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 3500));
	const result = await Promise.race([promptOnce(nick), timeout]);
	return result ?? fallback(nick);
}
