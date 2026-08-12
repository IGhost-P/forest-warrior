import Phaser from 'phaser';
import { HERO, type DamageRoll } from '../systems/balance';

/** 히어로 투사체 — GameScene의 풀 그룹에서 재사용된다.
 * Image가 아닌 Sprite 상속: Sprite만 UpdateList에 올라 preUpdate가 호출된다. */
export class Bullet extends Phaser.Physics.Arcade.Sprite {
	declare body: Phaser.Physics.Arcade.Body;

	roll: DamageRoll = { amount: 0, crit: false };
	dir: 1 | -1 = 1;

	constructor(scene: Phaser.Scene, x: number, y: number) {
		super(scene, x, y, 'bullet');
		this.setScale(1.6);
		this.setDepth(48);
	}

	fire(x: number, y: number, dir: 1 | -1, roll: DamageRoll): void {
		this.enableBody(true, x, y, true, true);
		this.body.setAllowGravity(false);
		this.roll = roll;
		this.dir = dir;
		this.setFlipX(dir === -1);
		this.setVelocityX(dir * HERO.bulletSpeed);
	}

	kill(): void {
		this.disableBody(true, true);
	}

	preUpdate(time: number, delta: number): void {
		super.preUpdate(time, delta);
		if (!this.active) return;
		const view = this.scene.cameras.main.worldView;
		if (this.x < view.left - 100 || this.x > view.right + 100) this.kill();
	}
}
