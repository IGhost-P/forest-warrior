# Forest Warrior

**Warrior of the Forest** — [NGAME_TEMP](https://github.com/IGhost-P/NGAME_TEMP)의 Phaser 3 + TypeScript 재구현.

플레이: https://forest-warrior.swyang.dev (또는 https://forest-warrior.dndb3599.workers.dev)

- 모바일 지원: 가상 버튼, Scale.FIT, PWA(홈 화면 설치·오프라인)
- 스테이지 1~3 + **엔드리스 웨이브 모드**
- **해골 6종**: 일반 / 유령(반투명 관통 돌진) / 광폭(고속 돌진) / 정예(대형 탱커) / 도약(점프 접근) / 저격(원거리 뼈화살)
- **보스 패턴**: 근접 베기 · 부하 소환 · 예고 후 대시 돌진 · HP 30% 분노 모드
- **AI 보스 디렉터**: 구간 전투 데이터(명중률·피격량·궁 사용)를 Chrome 내장 AI(Prompt API)에 주고
  보스의 공격성·소환/돌진 성향·체력 보정을 결정. AI가 없으면 규칙 기반 fallback
- 히어로 성장: Lv4 관통 화살 → Lv7 후방 화살 → Lv9 관통 강화, 궁극기 '해골 폭풍'(Z)
- 랭킹: Cloudflare Workers + KV (`/api/rank`)
- 타격감: hit-stop, 카메라 셰이크, 데미지 팝업(크리티컬), 넉백, 파티클

## 개발

```bash
npm install
npm run dev          # 게임만 (localhost:5173)
npm run worker:dev   # 랭킹 API 로컬 (localhost:8787) — dev 서버가 /api를 여기로 프록시
npm test             # vitest (밸런스/랭킹 로직)
npm run build        # tsc 체크 + vite build → dist/
```

## 배포 (Cloudflare)

```bash
npx wrangler login
npx wrangler kv namespace create RANK_KV   # 출력된 id를 wrangler.jsonc에 반영
npm run deploy                             # 빌드 + Worker/정적파일 배포
```

Worker 하나가 정적 파일(`dist/`)과 `/api/rank`를 함께 서빙한다.

## 조작

| 동작 | PC | 모바일 |
|---|---|---|
| 이동 | ← → | ◀ ▶ 버튼 |
| 점프 | ↑ / Space | 점프 버튼 |
| 공격 | X | 공격 버튼 |

## 구조

- `src/systems/balance.ts` — 모든 게임 수치 (여기만 고치면 밸런스 조정 끝)
- `src/scenes/` — Boot(로딩) / Title(닉네임·랭킹) / Game(본체) / Hud(바·가상버튼)
- `shared/rank.ts` — 랭킹 병합·검증 (게임·Worker 공용, 테스트 대상)
- `worker/index.ts` — 랭킹 API + 정적 서빙
- `scripts/convert-assets.sh` — 원본 저장소 에셋 변환(일회성, ffmpeg 필요)

설계 문서: [docs/superpowers/specs/2026-08-12-forest-warrior-rebuild-design.md](docs/superpowers/specs/2026-08-12-forest-warrior-rebuild-design.md)
