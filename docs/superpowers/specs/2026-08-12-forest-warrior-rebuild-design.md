# Forest Warrior 재구현 설계

날짜: 2026-08-12
원본: https://github.com/IGhost-P/NGAME_TEMP (바닐라 JS DOM 게임 "Warrior of the Forest")

## 목표

- 원작의 에셋을 재활용해 Phaser 3 + TypeScript로 재구현
- 모바일(터치)에서 충분히 돌아갈 것 — 가상 버튼, Scale.FIT, PWA
- 사라진 랭킹 서버를 Cloudflare Workers + KV로 대체
- 심플한 단일 배포: Worker 하나가 정적 파일 서빙 + 랭킹 API 담당

## 결정 사항 (사용자 확정)

| 항목 | 결정 |
|---|---|
| 렌더링 | Phaser 3 (Canvas/WebGL) |
| 언어 | TypeScript + Vite |
| 랭킹 | Cloudflare Workers + KV |
| 모바일 조작 | 가상 버튼 (◀▶ / 점프 / 공격) |
| 저장소 | 새 저장소 forest-warrior |
| 개선 | 엔드리스 모드, 몹 변형 실사용, PWA, 타격감(juice), 오디오 압축, 밸런스 재설계, 사운드 토글 |

Rust/WASM 검토 결과: 이 게임의 병목은 CPU가 아니라 GPU 그리기·에셋 로딩이며,
WASM 바이너리(10MB+)는 모바일 첫 로딩을 오히려 악화시켜 기각.

## 아키텍처

```
forest-warrior/
├── src/                  # Phaser 게임 (Vite + TS)
│   ├── main.ts           # 부트스트랩 + SW 등록
│   ├── config.ts         # 논리 해상도 1280x720, 물리 설정
│   ├── scenes/           # Boot / Title / Game / Hud
│   ├── entities/         # Hero, Monster, Weapon(투사체)
│   └── systems/          # balance(수치), WaveSpawner, rankClient
├── shared/rank.ts        # 랭킹 병합·검증 순수 로직 (게임/워커 공용, 유닛테스트)
├── worker/index.ts       # Cloudflare Worker: /api/rank + 정적 서빙
├── public/assets/        # 변환 완료 에셋 (시트/오디오/폰트/아이콘)
├── scripts/convert-assets.sh  # NGAME_TEMP → 변환 (일회성, ffmpeg)
└── tests/                # vitest: balance, rank
```

## 에셋 변환 (원본 CSS steps() 값에서 프레임 수 확보)

| 에셋 | 원본 | 변환 |
|---|---|---|
| 히어로 attack/jump/die | PNG 시트 15f×115×90 / 22f×80×118 / 17f×115×90 | 그대로 복사 |
| 히어로 run/idle/hit | GIF 10f/12f/6f (180×180) | ffmpeg로 80×80 시트화 (neighbor) |
| 스켈레톤 run/attack/dead | 6f×105×81 | 복사, 스테이지2·3은 tint 변형 |
| 보스 walk/attack/dead | 6f/8f/4f×300×225 | 복사, tint 변형 |
| 공룡(pink/yellow/green) | 8f×450×472 run만 | 엔드리스 돌진형 엘리트로 사용 |
| 좀비 | 10f×430×519 run만 | 엔드리스 돌진형으로 사용 |
| levelup_effect | 6f×180×180 | 복사 |
| 배경 | static_bg(원경), dynamic_bg(근경) 1440×1024 | tileSprite 무한 스크롤, 스테이지별 tint |
| 오디오 | wav 36MB | mp3 96k 변환 (~2MB) |
| 폰트 | PFStardust(한글 픽셀), LuckiestGuy(타이틀) | 복사 |
| PWA 아이콘 | profile.png 64×64 | neighbor 업스케일 192/512 |

## 게임플레이

- 스테이지 1~3: 일반몹 10 + 보스 1. 스테이지별 몹/보스 tint 및 수치 상승
- 엔드리스: 스테이지 3 클리어 후 무한 웨이브. 웨이브마다 몹 수·HP·데미지·점수배율 상승,
  공룡/좀비 돌진형(접촉 데미지 후 자폭) 혼합 등장
- 밸런스: balance.ts 단일 파일. 히어로 HP 100+20/lv, 공격 30+6/lv(±10% 분산, 15% 크리 ×2),
  EXP 곡선 60+30/lv. 원작의 HP 1,000,000 디버그값 제거
- 타격감: 명중 hit-stop(~50ms), 카메라 셰이크(보스), 데미지 팝업(크리 강조), 넉백, 사망 파티클
- 피격 후 0.8초 무적(점멸)

## 모바일

- 논리 해상도 1280×720, Scale.FIT + autoCenter, 가로 전제(세로 시 회전 안내 오버레이)
- 가상 버튼: 좌측 ◀▶, 우측 점프/공격, 멀티터치(input.addPointer), 터치 기기에서만 표시
- PWA: manifest(fullscreen/landscape) + 런타임 캐시 SW → 재방문 즉시 로딩, 오프라인 플레이

## 랭킹 API

- `GET /api/rank/top?n=10` → 상위 N (기본 10, 최대 100)
- `POST /api/rank` `{name, score, wave}` → 검증(이름 1~12자, 점수 상한) 후 KV top100에 병합, 내 순위 반환
- KV: 단일 키 `top100`에 JSON 배열(쓰기 시 병합·정렬·슬라이스). IP당 분당 10회 제한
- 실패 시 클라이언트는 localStorage 로컬 랭킹으로 fallback
- 클라이언트 게임 특성상 완전한 치팅 방지는 범위 외(상한 검증까지만)

## 에러 처리

- 랭킹 API 실패 → 로컬 랭킹 표시 + "오프라인" 뱃지
- 오디오 잠금 → 첫 터치에서 Phaser가 자동 해제
- 에셋 로딩 실패 → BootScene 에러 표시 + 재시도 버튼

## 테스트

- vitest: balance 곡선(단조 증가, 상한), rank 병합(정렬·중복·슬라이스·검증)
- Worker: wrangler dev 로컬 KV로 수동 검증
- 게임플레이: 브라우저 프리뷰로 실기 확인

## 배포

```
npm run build && npx wrangler deploy   # 사전에 wrangler login + KV namespace 생성 필요
```
