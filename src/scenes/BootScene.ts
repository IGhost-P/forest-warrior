import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';

/** 에셋 로딩 + 애니메이션 등록 + 폰트 준비 */
export class BootScene extends Phaser.Scene {
	constructor() {
		super('boot');
	}

	preload(): void {
		const barBg = this.add.rectangle(GAME_W / 2, GAME_H / 2, 480, 22, 0x1b2233).setStrokeStyle(2, 0x4a5a7a);
		const bar = this.add.rectangle(GAME_W / 2 - 238, GAME_H / 2, 1, 16, 0x6ee7a0).setOrigin(0, 0.5);
		const label = this.add.text(GAME_W / 2, GAME_H / 2 - 40, 'LOADING...', { fontFamily: 'monospace', fontSize: '20px', color: '#9fb3d9' }).setOrigin(0.5);

		this.load.on(Phaser.Loader.Events.PROGRESS, (v: number) => {
			bar.width = 476 * v;
		});
		this.load.on(Phaser.Loader.Events.COMPLETE, () => {
			barBg.destroy();
			bar.destroy();
			label.destroy();
		});

		const S = 'assets/sprites';
		// 히어로
		this.load.spritesheet('hero_idle', `${S}/hero_idle.png`, { frameWidth: 80, frameHeight: 80 });
		this.load.spritesheet('hero_run', `${S}/hero_run.png`, { frameWidth: 80, frameHeight: 80 });
		this.load.spritesheet('hero_hit', `${S}/hero_hit.png`, { frameWidth: 80, frameHeight: 80 });
		this.load.spritesheet('hero_attack', `${S}/hero_attack.png`, { frameWidth: 115, frameHeight: 90 });
		this.load.spritesheet('hero_jump', `${S}/hero_jump.png`, { frameWidth: 80, frameHeight: 118 });
		this.load.spritesheet('hero_die', `${S}/hero_die.png`, { frameWidth: 115, frameHeight: 89 });
		// 몬스터
		this.load.spritesheet('skel_run', `${S}/skel_run.png`, { frameWidth: 105, frameHeight: 81 });
		this.load.spritesheet('skel_attack', `${S}/skel_attack.png`, { frameWidth: 105, frameHeight: 81 });
		this.load.spritesheet('skel_dead', `${S}/skel_dead.png`, { frameWidth: 105, frameHeight: 81 });
		this.load.spritesheet('boss_walk', `${S}/boss_walk.png`, { frameWidth: 300, frameHeight: 226 });
		this.load.spritesheet('boss_attack', `${S}/boss_attack.png`, { frameWidth: 300, frameHeight: 225 });
		this.load.spritesheet('boss_dead', `${S}/boss_dead.png`, { frameWidth: 300, frameHeight: 225 });
		this.load.spritesheet('dino_pink', `${S}/dino_pink.png`, { frameWidth: 450, frameHeight: 472 });
		this.load.spritesheet('dino_yellow', `${S}/dino_yellow.png`, { frameWidth: 450, frameHeight: 472 });
		this.load.spritesheet('dino_green', `${S}/dino_green.png`, { frameWidth: 450, frameHeight: 472 });
		this.load.spritesheet('zombie', `${S}/zombie_run.png`, { frameWidth: 430, frameHeight: 519 });
		this.load.spritesheet('levelup_fx', `${S}/levelup_fx.png`, { frameWidth: 180, frameHeight: 180 });
		this.load.image('bullet', `${S}/bullet.png`);
		this.load.image('die_fx', `${S}/die_fx.png`);
		// 배경/UI
		this.load.image('bg_far', 'assets/bg/far.png');
		this.load.image('bg_near', 'assets/bg/near.png');
		this.load.image('title_bg', 'assets/ui/title_bg.png');
		this.load.image('ui_modal', 'assets/ui/modal.png');
		this.load.image('ui_btn', 'assets/ui/btn.png');
		// 오디오
		const A = 'assets/audio';
		this.load.audio('bgm_lobby', `${A}/bgm_lobby.mp3`);
		this.load.audio('bgm_battle', `${A}/bgm_battle.mp3`);
		for (const k of ['attack', 'jump', 'jump_land', 'hit', 'walk', 'dead']) {
			this.load.audio(`sfx_hero_${k}`, `${A}/sfx_hero_${k}.mp3`);
		}
		for (const k of ['attack', 'hit', 'dead']) {
			this.load.audio(`sfx_monster_${k}`, `${A}/sfx_monster_${k}.mp3`);
		}

		this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
			console.warn('로드 실패:', file.key);
		});
	}

	create(): void {
		this.createAnims();
		this.makeSparkTexture();

		// 저장된 음소거 설정 적용
		this.sound.mute = localStorage.getItem('fw_muted') === '1';

		// 픽셀 폰트 로드 후 시작 (실패해도 시스템 폰트로 진행)
		const fonts = [
			new FontFace('PFStardust', 'url(assets/fonts/PFStardust.ttf)'),
			new FontFace('LuckiestGuy', 'url(assets/fonts/LuckiestGuy.ttf)'),
		];
		Promise.allSettled(fonts.map(f => f.load()))
			.then(results => {
				for (const r of results) {
					if (r.status === 'fulfilled') document.fonts.add(r.value);
				}
			})
			.finally(() => this.scene.start('title'));
	}

	private createAnims(): void {
		const a = this.anims;
		// 히어로
		a.create({ key: 'hero_idle', frames: a.generateFrameNumbers('hero_idle'), frameRate: 9, repeat: -1 });
		a.create({ key: 'hero_run', frames: a.generateFrameNumbers('hero_run'), frameRate: 14, repeat: -1 });
		a.create({ key: 'hero_hit', frames: a.generateFrameNumbers('hero_hit'), frameRate: 12 });
		a.create({ key: 'hero_attack', frames: a.generateFrameNumbers('hero_attack'), duration: 200 });
		a.create({ key: 'hero_jump', frames: a.generateFrameNumbers('hero_jump'), duration: 750 });
		a.create({ key: 'hero_die', frames: a.generateFrameNumbers('hero_die', { start: 0, end: 16 }), duration: 1000 });
		// 스켈레톤/보스
		a.create({ key: 'skel_run', frames: a.generateFrameNumbers('skel_run'), frameRate: 6, repeat: -1 });
		a.create({ key: 'skel_attack', frames: a.generateFrameNumbers('skel_attack'), duration: 700 });
		a.create({ key: 'skel_dead', frames: a.generateFrameNumbers('skel_dead'), duration: 900 });
		a.create({ key: 'boss_walk', frames: a.generateFrameNumbers('boss_walk'), frameRate: 6, repeat: -1 });
		a.create({ key: 'boss_attack', frames: a.generateFrameNumbers('boss_attack'), duration: 700 });
		a.create({ key: 'boss_dead', frames: a.generateFrameNumbers('boss_dead'), duration: 900 });
		// 돌진형
		for (const d of ['dino_pink', 'dino_yellow', 'dino_green']) {
			a.create({ key: `${d}_run`, frames: a.generateFrameNumbers(d), frameRate: 12, repeat: -1 });
		}
		a.create({ key: 'zombie_run', frames: a.generateFrameNumbers('zombie'), frameRate: 12, repeat: -1 });
		// 이펙트
		a.create({ key: 'levelup_fx', frames: a.generateFrameNumbers('levelup_fx'), duration: 800 });
	}

	/** 파티클용 6x6 사각 텍스처 */
	private makeSparkTexture(): void {
		const g = this.add.graphics();
		g.fillStyle(0xffffff, 1);
		g.fillRect(0, 0, 6, 6);
		g.generateTexture('spark', 6, 6);
		g.destroy();
	}
}
