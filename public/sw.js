/* Forest Warrior 서비스워커
 * - 내비게이션(HTML): 네트워크 우선, 실패 시 캐시 → 항상 최신 배포 반영
 * - 정적 에셋(해시 파일명): 캐시 우선 → 재방문 즉시 로딩, 오프라인 플레이
 * - /api/*: 캐시하지 않음
 */
const CACHE = 'fw-v1';

self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', event => {
	event.waitUntil(
		caches
			.keys()
			.then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
			.then(() => self.clients.claim()),
	);
});

self.addEventListener('fetch', event => {
	const req = event.request;
	const url = new URL(req.url);
	if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

	if (req.mode === 'navigate') {
		event.respondWith(
			fetch(req)
				.then(res => {
					const clone = res.clone();
					caches.open(CACHE).then(c => c.put(req, clone));
					return res;
				})
				.catch(() => caches.match(req).then(hit => hit ?? caches.match('/'))),
		);
		return;
	}

	event.respondWith(
		caches.match(req).then(
			hit =>
				hit ??
				fetch(req).then(res => {
					if (res.ok) {
						const clone = res.clone();
						caches.open(CACHE).then(c => c.put(req, clone));
					}
					return res;
				}),
		),
	);
});
