import type { FishingEncounterResponse } from "@fishing/shared/contracts";
import type Phaser from "phaser";
import type { FishingCompleteEvent } from "../phaser-runtime";
import type { FightLayout } from "./ocean-layout";
import { BODY_FONT, COLORS, hex, type OceanDrawing, type TrackObject } from "./ocean-drawing";

interface Floater {
  text: Phaser.GameObjects.Text;
  busy: boolean;
}

interface OceanEffectsContext {
  scene: Phaser.Scene;
  drawing: OceanDrawing;
  track: TrackObject;
  getLayout: () => FightLayout;
  getEncounter: () => FishingEncounterResponse | undefined;
  isFightMode: () => boolean;
}

export class OceanEffects {
  private readonly floaters: Floater[] = [];

  constructor(private readonly context: OceanEffectsContext) {}

  clear(): void {
    this.context.scene.tweens.killAll();
    this.context.scene.time.removeAllEvents();
    this.floaters.length = 0;
  }

  spawnFloater(message: string, color: number, x: number, y: number): void {
    let floater = this.floaters.find((candidate) => !candidate.busy);
    if (!floater) {
      if (this.floaters.length >= 6) return;
      const text = this.context.track(this.context.scene.add.text(0, 0, "", { fontFamily: BODY_FONT, fontSize: "13px", fontStyle: "bold", stroke: "#04101c", strokeThickness: 4 }).setOrigin(0.5).setDepth(18).setAlpha(0));
      floater = { text, busy: false };
      this.floaters.push(floater);
    }
    floater.busy = true;
    floater.text.setText(message).setColor(hex(color)).setPosition(x, y).setAlpha(1).setScale(0.85);
    this.context.scene.tweens.killTweensOf(floater.text);
    this.context.scene.tweens.add({
      targets: floater.text,
      alpha: 0,
      scale: 1.1,
      y: y - 30,
      duration: 700,
      ease: "Cubic.easeOut",
      onComplete: () => {
        floater.busy = false;
      },
    });
  }

  warnLowTime(): void {
    const timerText = this.context.drawing.getFightView()?.timerText;
    if (!timerText) return;
    navigator.vibrate?.(18);
    this.context.scene.tweens.add({ targets: timerText, scale: 1.35, duration: 130, yoyo: true, ease: "Quad.easeOut" });
  }

  playIntroSequence(onReady: () => void): void {
    const view = this.context.drawing.getFightView();
    const encounter = this.context.getEncounter();
    if (!view || !encounter) return;
    const layout = this.context.getLayout();
    const centerX = this.context.scene.scale.width / 2;
    const centerY = (layout.trackTop + layout.trackBottom) / 2;
    this.context.scene.tweens.killTweensOf([view.banner, view.bannerSub]);
    view.banner.setText("READY").setColor("#fff7dd").setPosition(centerX, centerY - 14).setAlpha(0).setScale(0.5);
    view.bannerSub.setText("TIME STARTS ON GO").setPosition(centerX, centerY + 26).setAlpha(0);
    navigator.vibrate?.([14, 60, 22]);
    this.burstSparkles(centerX, centerY, COLORS.foam);
    this.context.scene.tweens.add({ targets: view.banner, alpha: 1, scale: 1, duration: 300, ease: "Back.easeOut" });
    this.context.scene.tweens.add({ targets: view.bannerSub, alpha: 1, duration: 260, delay: 260 });
    view.holdHint.setAlpha(0.5);
    this.context.scene.time.delayedCall(1050, () => {
      if (!this.context.isFightMode()) return;
      this.context.scene.tweens.add({ targets: [view.banner, view.bannerSub], alpha: 0, y: "-=18", duration: 280, ease: "Cubic.easeIn" });
    });
    this.context.scene.time.delayedCall(1200, () => {
      if (!this.context.isFightMode()) return;
      view.banner.setText("GO!").setColor(hex(COLORS.netActive)).setAlpha(0).setScale(0.8);
      this.context.scene.tweens.add({ targets: view.banner, alpha: 1, scale: 1.1, duration: 180, ease: "Back.easeOut" });
      this.context.scene.tweens.add({ targets: view.banner, alpha: 0, duration: 200, delay: 180, ease: "Cubic.easeIn" });
      navigator.vibrate?.(20);
    });
    this.context.scene.time.delayedCall(1380, () => {
      if (!this.context.isFightMode()) return;
      onReady();
    });
  }

  showHoldHintPulse(): void {
    const holdHint = this.context.drawing.getFightView()?.holdHint;
    if (!holdHint) return;
    this.context.scene.tweens.add({ targets: holdHint, alpha: 0.35, duration: 620, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
  }

  finishEncounter(
    result: "caught" | "lost",
    event: FishingCompleteEvent,
    onComplete: (event: FishingCompleteEvent) => void,
    onAmbient: () => void,
    isCompleted: () => boolean,
  ): void {
    const view = this.context.drawing.getFightView();
    if (!view) return;
    const layout = this.context.getLayout();
    const centerX = this.context.scene.scale.width / 2;
    const centerY = (layout.trackTop + layout.trackBottom) / 2;
    if (result === "caught") {
      navigator.vibrate?.([25, 35, 60]);
      this.context.scene.cameras.main.flash(200, 168, 250, 216, false);
      this.resetBanners();
      view.banner.setText("LANDED!").setColor("#eafff4").setPosition(centerX, centerY).setAlpha(0).setScale(0.55);
      view.bannerSub.setText("Reeled it in").setPosition(centerX, centerY + 30).setAlpha(0);
      this.context.scene.tweens.add({ targets: view.banner, alpha: 1, scale: 1, duration: 300, ease: "Back.easeOut" });
      this.context.scene.tweens.add({ targets: view.bannerSub, alpha: 1, duration: 240, delay: 160 });
      this.burstSparkles(centerX, centerY, COLORS.netActive);
      this.burstSparkles(centerX, centerY, COLORS.net);
      this.context.scene.tweens.add({ targets: [view.net, view.fishContainer], scale: 1.18, alpha: 0, delay: 160, duration: 400, ease: "Back.easeIn" });
    } else {
      navigator.vibrate?.(45);
      this.context.scene.cameras.main.shake(220, 0.006);
      this.resetBanners();
      view.banner.setText("IT GOT AWAY…").setColor("#ffd7cf").setPosition(centerX, centerY).setAlpha(0).setScale(0.7);
      view.bannerSub.setText("It slipped the net").setPosition(centerX, centerY + 30).setAlpha(0);
      this.context.scene.tweens.add({ targets: view.banner, alpha: 1, scale: 1, duration: 280, ease: "Quad.easeOut" });
      this.context.scene.tweens.add({ targets: view.bannerSub, alpha: 1, duration: 220, delay: 140 });
      this.context.scene.tweens.add({ targets: view.fishContainer, x: this.context.scene.scale.width + 90, scaleX: 1.35, duration: 420, ease: "Cubic.easeIn" });
      this.context.scene.tweens.add({ targets: view.net, alpha: 0.35, duration: 300 });
    }
    this.context.scene.time.delayedCall(result === "caught" ? 820 : 680, () => {
      if (isCompleted()) return;
      onComplete(event);
    });
    this.context.scene.time.delayedCall(1500, () => {
      if (isCompleted()) onAmbient();
    });
  }

  private resetBanners(): void {
    const view = this.context.drawing.getFightView();
    if (!view) return;
    this.context.scene.tweens.killTweensOf([view.banner, view.bannerSub]);
    view.banner.setAlpha(0).setScale(1);
    view.bannerSub.setAlpha(0);
  }

  private burstSparkles(x: number, y: number, color: number): void {
    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2 + Math.random() * 0.5;
      const distance = 34 + Math.random() * 46;
      const spark = this.context.track(this.context.scene.add.circle(x, y, 2 + Math.random() * 2.4, color, 0.95).setDepth(19));
      this.context.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.3,
        duration: 480 + Math.random() * 240,
        ease: "Cubic.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }
}
