#!/usr/bin/env bash
# NGAME_TEMP 원본 에셋 → Phaser용 변환 (일회성)
# 사용법: scripts/convert-assets.sh [NGAME_TEMP의 src/lib 경로]
set -euo pipefail

SRC="${1:-../NGAME_TEMP/src/lib}"
OUT="public/assets"
mkdir -p "$OUT"/{sprites,bg,ui,audio,fonts}

echo "== 히어로: PNG 시트 복사 =="
cp "$SRC/images/hero/lv1/attack.png" "$OUT/sprites/hero_attack.png"   # 15f 115x90
cp "$SRC/images/hero/lv1/jump.png"   "$OUT/sprites/hero_jump.png"     # 22f 80x118
cp "$SRC/images/hero/lv1/die.png"    "$OUT/sprites/hero_die.png"      # 18f 115x90 (17f 사용)

echo "== 히어로: GIF → 80x80 시트 (픽셀아트 보존 neighbor) =="
ffmpeg -y -v error -i "$SRC/images/hero/lv1/run.gif"  -vf "scale=80:80:flags=neighbor,tile=10x1" -frames:v 1 "$OUT/sprites/hero_run.png"
ffmpeg -y -v error -i "$SRC/images/hero/lv1/idle.gif" -vf "scale=80:80:flags=neighbor,tile=12x1" -frames:v 1 "$OUT/sprites/hero_idle.png"
ffmpeg -y -v error -i "$SRC/images/hero/lv1/hit.gif"  -vf "scale=80:80:flags=neighbor,tile=6x1"  -frames:v 1 "$OUT/sprites/hero_hit.png"

echo "== 몬스터 =="
cp "$SRC/images/monster/stage1/skeleton/run.png"    "$OUT/sprites/skel_run.png"     # 6f 105x81
cp "$SRC/images/monster/stage1/skeleton/attack.png" "$OUT/sprites/skel_attack.png"  # 6f 105x81
cp "$SRC/images/monster/stage1/skeleton/dead.png"   "$OUT/sprites/skel_dead.png"    # 6f 105x81
cp "$SRC/images/monster/stage1/skeleton_boss/boss_walk.png"    "$OUT/sprites/boss_walk.png"    # 6f 300x226
cp "$SRC/images/monster/stage1/skeleton_boss/boss_attackA.png" "$OUT/sprites/boss_attack.png"  # 8f 300x225
cp "$SRC/images/monster/stage1/skeleton_boss/boss_dead.png"    "$OUT/sprites/boss_dead.png"    # 4f 300x225
cp "$SRC/images/monster/monster_pink_run.png"   "$OUT/sprites/dino_pink.png"    # 8f 450x472
cp "$SRC/images/monster/monster_yellow_run.png" "$OUT/sprites/dino_yellow.png"  # 8f 450x472
cp "$SRC/images/monster/monster_green_run.png"  "$OUT/sprites/dino_green.png"   # 8f 450x472
cp "$SRC/images/monster/zombie_run.png"         "$OUT/sprites/zombie_run.png"   # 10f 430x519

echo "== 무기/이펙트 =="
cp "$SRC/images/weapon/lv1/weapon_lv1.png"     "$OUT/sprites/bullet.png"          # 40x10
cp "$SRC/images/common/levelup_effect.png"     "$OUT/sprites/levelup_fx.png"      # 6f 180x180
cp "$SRC/images/common/die_effect.png"         "$OUT/sprites/die_fx.png"          # 308x308

echo "== 배경/UI =="
cp "$SRC/images/stage/lv1/static_bg.png"       "$OUT/bg/far.png"    # 1440x1024 원경
cp "$SRC/images/stage/lv1/dynamic_bg.png"      "$OUT/bg/near.png"   # 1440x1024 근경
cp "$SRC/images/common/start_background.png"   "$OUT/ui/title_bg.png"
cp "$SRC/images/common/modal.png"              "$OUT/ui/modal.png"
cp "$SRC/images/common/btn.png"                "$OUT/ui/btn.png"

echo "== 폰트 =="
cp "$SRC/fonts/PFStardust.ttf"          "$OUT/fonts/PFStardust.ttf"
cp "$SRC/fonts/LuckiestGuy-Regular.ttf" "$OUT/fonts/LuckiestGuy.ttf"

echo "== 오디오: wav → mp3 =="
ffmpeg -y -v error -i "$SRC/audios/bgm/lobby.wav"  -codec:a libmp3lame -b:a 96k "$OUT/audio/bgm_lobby.mp3"
ffmpeg -y -v error -i "$SRC/audios/bgm/battle.wav" -codec:a libmp3lame -b:a 96k "$OUT/audio/bgm_battle.mp3"
for who in hero monster; do
	for f in "$SRC/audios/effects/$who/"*.wav; do
		name=$(basename "$f" .wav)
		ffmpeg -y -v error -i "$f" -codec:a libmp3lame -b:a 80k -ac 1 "$OUT/audio/sfx_${who}_${name}.mp3"
	done
done

echo "== PWA 아이콘 (픽셀 업스케일) =="
ffmpeg -y -v error -i "$SRC/images/hero/lv1/profile.png" -vf "scale=192:192:flags=neighbor" ../forest-warrior/public/icon-192.png 2>/dev/null \
	|| ffmpeg -y -v error -i "$SRC/images/hero/lv1/profile.png" -vf "scale=192:192:flags=neighbor" public/icon-192.png
ffmpeg -y -v error -i "$SRC/images/hero/lv1/profile.png" -vf "scale=512:512:flags=neighbor" public/icon-512.png

echo "완료:"
du -sh "$OUT"/sprites "$OUT"/bg "$OUT"/ui "$OUT"/audio "$OUT"/fonts
