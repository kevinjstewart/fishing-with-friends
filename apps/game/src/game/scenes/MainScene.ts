import type { FishingEncounterResponse } from "@fishing/shared";
import Phaser from "phaser";
import { createFishingState, performanceFor, seededRandom, stepFishing, type FishingState } from "../fishing-mechanics";

interface FishingCompleteEvent {
  encounterId: string;
  performance: number;
}

const COLORS = {
  deep: 0x061925,
  water: 0x0b3b4c,
  waterLight: 0x176276,
  foam: 0xbfe8df,
  net: 0xf4d58d,
  netActive: 0x8ef0c7,
  fish: 0xf4a261,
  fishLight: 0xffd28f,
  danger: 0xf06c62,
};

export class MainScene extends Phaser.Scene {
  private title?: Phaser.GameObjects.Text;
  private subtitle?: Phaser.GameObjects.Text;
  private encounterLabel?: Phaser.GameObjects.Text;
  private helpLabel?: Phaser.GameObjects.Text;
  private timerLabel?: Phaser.GameObjects.Text;
  private progressLabel?: Phaser.GameObjects.Text;
  private feedbackLabel?: Phaser.GameObjects.Text;
  private water?: Phaser.GameObjects.Graphics;
  private bubbles?: Phaser.GameObjects.Graphics;
  private net?: Phaser.GameObjects.Graphics;
  private fish?: Phaser.GameObjects.Container;
  private fishArt?: Phaser.GameObjects.Graphics;
  private progressTrack?: Phaser.GameObjects.Graphics;
  private activeEncounter?: FishingEncounterResponse;
  private fishingState?: FishingState;
  private random = Math.random;
  private inputHeld = false;
  private finished = false;
  private playfieldTop = 86;
  private playfieldHeight = 160;
  private netWidth = 180;
  private insideStreak = 0;

  constructor() {
    super("MainScene");
  }

  create(): void {
    this.game.events.on("fishing:start", this.startEncounter, this);
    this.game.events.on("fishing:lobby", this.showLobby, this);
    this.input.on("pointerdown", this.setInputHeld, this);
    this.input.on("pointerup", this.setInputReleased, this);
    this.input.on("pointerout", this.setInputReleased, this);
    this.input.keyboard?.on("keydown-SPACE", this.setInputHeld, this);
    this.input.keyboard?.on("keyup-SPACE", this.setInputReleased, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeListeners, this);
    this.showLobby();
  }

  update(_time: number, delta: number): void {
    if (!this.activeEncounter || !this.fishingState || this.finished) return;
    const step = stepFishing(this.fishingState, this.inputHeld, delta / 1000, this.activeEncounter.miniGame, this.activeEncounter.species.movementProfile, this.random);
    this.fishingState = step.state;
    this.fishingState.wasInside = !step.leftNet && (step.enteredNet || step.state.wasInside);
    this.insideStreak = this.fishingState.wasInside ? this.insideStreak + Math.min(delta / 1000, 0.05) : 0;
    if (step.enteredNet) this.showFeedback("IN THE NET", COLORS.netActive);
    if (step.leftNet) this.showFeedback("SLIPPING!", COLORS.danger);
    this.renderFrame();
    if (step.state.result !== "playing") this.finishEncounter(step.state.result);
  }

  private showLobby(): void {
    this.activeEncounter = undefined;
    this.fishingState = undefined;
    this.finished = false;
    this.inputHeld = false;
    this.children.removeAll(true);
    this.water = this.add.graphics();
    this.drawWater();
    this.title = this.add.text(0, 0, "FISHING\nWITH FRIENDS", {
      align: "center", color: "#f7e8bd", fontFamily: "Georgia, serif", fontSize: "30px", fontStyle: "bold", lineSpacing: -4, stroke: "#061925", strokeThickness: 5,
    });
    this.subtitle = this.add.text(0, 0, "Pick your water. The next one could be a trophy.", {
      color: "#bfe8df", fontFamily: "Trebuchet MS, sans-serif", fontSize: "15px",
    });
    this.layout({ width: this.scale.width, height: this.scale.height });
  }

  private startEncounter(encounter: FishingEncounterResponse): void {
    this.activeEncounter = encounter;
    this.finished = false;
    this.inputHeld = false;
    this.insideStreak = 0;
    this.random = seededRandom(encounter.difficultySeed);
    this.fishingState = createFishingState(this.random);
    this.children.removeAll(true);
    this.water = this.add.graphics();
    this.bubbles = this.add.graphics();
    this.net = this.add.graphics();
    this.progressTrack = this.add.graphics();
    this.fishArt = this.add.graphics();
    this.drawFish();
    this.fish = this.add.container(0, 0, [this.fishArt]);
    this.encounterLabel = this.add.text(0, 0, encounter.species.commonName.toUpperCase(), {
      color: "#fff4d6", fontFamily: "Georgia, serif", fontSize: "21px", fontStyle: "bold", letterSpacing: 1.2, stroke: "#061925", strokeThickness: 4,
    });
    this.helpLabel = this.add.text(0, 0, "HOLD TO LIFT  •  RELEASE TO DROP", {
      color: "#bfe8df", fontFamily: "Trebuchet MS, sans-serif", fontSize: "12px", fontStyle: "bold", letterSpacing: 1,
    });
    this.timerLabel = this.add.text(0, 0, "", { color: "#fff4d6", fontFamily: "Trebuchet MS, sans-serif", fontSize: "13px", fontStyle: "bold" });
    this.progressLabel = this.add.text(0, 0, "NET CONTROL", {
      color: "#bfe8df", fontFamily: "Trebuchet MS, sans-serif", fontSize: "11px", fontStyle: "bold", letterSpacing: 1.4,
    });
    this.feedbackLabel = this.add.text(0, 0, "", {
      color: "#8ef0c7", fontFamily: "Trebuchet MS, sans-serif", fontSize: "13px", fontStyle: "bold", stroke: "#061925", strokeThickness: 4,
    }).setAlpha(0);
    this.layout({ width: this.scale.width, height: this.scale.height });
    this.renderFrame();
    this.showFeedback("STEADY…", COLORS.net);
  }

  private drawWater(): void {
    if (!this.water) return;
    const width = this.scale.width;
    const height = this.scale.height;
    this.water.clear();
    this.water.fillStyle(COLORS.deep, 1).fillRect(0, 0, width, height);
    this.water.fillStyle(COLORS.water, 0.88).fillRect(0, 64, width, Math.max(0, height - 64));
    this.water.fillStyle(COLORS.waterLight, 0.12);
    for (let y = 84; y < height; y += 34) {
      const offset = (y / 34) % 2 === 0 ? -20 : 16;
      this.water.fillRoundedRect(offset, y, width * 0.66, 3, 2);
      this.water.fillRoundedRect(width * 0.72 + offset, y + 11, width * 0.34, 2, 2);
    }
    this.water.lineStyle(1, COLORS.foam, 0.1).strokeRoundedRect(12, this.playfieldTop - 8, width - 24, this.playfieldHeight + 16, 18);
  }

  private drawFish(): void {
    if (!this.fishArt) return;
    this.fishArt.clear();
    this.fishArt.fillStyle(COLORS.fish, 1).fillTriangle(-19, 0, -35, -12, -34, 12).fillEllipse(0, 0, 46, 22);
    this.fishArt.fillStyle(COLORS.fishLight, 0.75).fillEllipse(4, -3, 22, 7);
    this.fishArt.fillStyle(0x102530, 1).fillCircle(14, -3, 2.5);
    this.fishArt.lineStyle(2, 0xffe5b0, 0.72).strokeEllipse(0, 0, 46, 22);
  }

  private drawNet(active: boolean): void {
    if (!this.net || !this.activeEncounter) return;
    const height = this.playfieldHeight * this.activeEncounter.miniGame.catchZoneSize;
    const width = this.netWidth;
    const color = active ? COLORS.netActive : COLORS.net;
    this.net.clear();
    this.net.fillStyle(color, active ? 0.16 : 0.08).fillEllipse(0, 0, width, height);
    this.net.lineStyle(active ? 4 : 3, color, active ? 1 : 0.82).strokeEllipse(0, 0, width, height);
    this.net.lineStyle(1, color, active ? 0.46 : 0.24);
    for (let x = -width * 0.32; x <= width * 0.32; x += width * 0.16) this.net.lineBetween(x, -height * 0.38, x, height * 0.38);
    for (let y = -height * 0.24; y <= height * 0.24; y += Math.max(10, height * 0.16)) this.net.lineBetween(-width * 0.43, y, width * 0.43, y);
    this.net.lineStyle(7, 0x8b6440, 1).lineBetween(width / 2 - 2, 0, width / 2 + 68, 25);
    this.net.lineStyle(2, 0xd7aa6d, 0.8).lineBetween(width / 2 + 1, -2, width / 2 + 68, 22);
  }

  private renderFrame(): void {
    if (!this.fishingState || !this.activeEncounter) return;
    const state = this.fishingState;
    const centerX = this.scale.width / 2;
    const netY = this.playfieldTop + this.playfieldHeight * state.netPosition;
    const fishY = this.playfieldTop + this.playfieldHeight * state.fishPosition;
    this.drawNet(state.wasInside);
    this.net?.setPosition(centerX - 24, netY).setScale(state.wasInside ? 1 + Math.min(this.insideStreak, 0.5) * 0.035 : 1);
    this.fish?.setPosition(centerX - 24, fishY).setRotation(state.fishVelocity * 0.38).setScale(state.fishVelocity < 0 ? 1 : -1, 1);
    this.bubbles?.clear().lineStyle(1, COLORS.foam, 0.25);
    for (let index = 0; index < 9; index += 1) {
      const x = 24 + ((index * 83 + this.activeEncounter.difficultySeed) % Math.max(40, this.scale.width - 48));
      const cycle = (state.elapsed * (10 + index) + index * 31) % Math.max(80, this.playfieldHeight);
      this.bubbles?.strokeCircle(x, this.playfieldTop + this.playfieldHeight - cycle, 2 + (index % 3));
    }
    const remaining = Math.max(0, this.activeEncounter.miniGame.durationSeconds - state.elapsed);
    this.timerLabel?.setText(`${remaining.toFixed(1)}s`);
    this.progressTrack?.clear();
    const barX = 18;
    const barY = this.scale.height - 19;
    const barWidth = this.scale.width - 36;
    this.progressTrack?.fillStyle(0x031017, 0.72).fillRoundedRect(barX, barY, barWidth, 11, 6);
    const barColor = state.progress < 0.2 ? COLORS.danger : state.progress > 0.72 ? COLORS.netActive : COLORS.net;
    this.progressTrack?.fillStyle(barColor, 1).fillRoundedRect(barX, barY, Math.max(8, barWidth * state.progress), 11, 6);
    this.progressTrack?.lineStyle(1, COLORS.foam, 0.24).strokeRoundedRect(barX, barY, barWidth, 11, 6);
  }

  private showFeedback(message: string, color: number): void {
    if (!this.feedbackLabel) return;
    this.feedbackLabel.setPosition(this.scale.width / 2, this.playfieldTop + this.playfieldHeight * 0.5);
    this.feedbackLabel.setText(message).setColor(`#${color.toString(16).padStart(6, "0")}`).setAlpha(1).setScale(0.88);
    this.tweens.killTweensOf(this.feedbackLabel);
    this.tweens.add({ targets: this.feedbackLabel, alpha: 0, scale: 1.08, y: this.feedbackLabel.y - 8, duration: 620, ease: "Cubic.easeOut" });
    if (message === "IN THE NET") navigator.vibrate?.(12);
  }

  private finishEncounter(result: "caught" | "lost"): void {
    if (!this.activeEncounter || !this.fishingState || this.finished) return;
    this.finished = true;
    this.inputHeld = false;
    const event: FishingCompleteEvent = { encounterId: this.activeEncounter.encounterId, performance: performanceFor(this.fishingState) };
    if (result === "caught") {
      this.showFeedback("SCOOPED!", COLORS.netActive);
      this.cameras.main.flash(180, 142, 240, 199, false);
      this.tweens.add({ targets: [this.net, this.fish], scaleX: 1.16, scaleY: 1.16, alpha: 0, duration: 420, ease: "Back.easeIn" });
      navigator.vibrate?.([25, 35, 55]);
    } else {
      this.showFeedback("ESCAPED", COLORS.danger);
      this.cameras.main.shake(220, 0.008);
      this.tweens.add({ targets: this.fish, x: this.scale.width + 70, duration: 360, ease: "Cubic.easeIn" });
      navigator.vibrate?.(45);
    }
    this.time.delayedCall(460, () => this.game.events.emit("fishing:complete", event));
  }

  private setInputHeld(): void {
    if (!this.activeEncounter || this.finished) return;
    this.inputHeld = true;
  }

  private setInputReleased(): void {
    this.inputHeld = false;
  }

  private layout(size: { width: number; height: number }): void {
    const centerX = size.width / 2;
    this.playfieldTop = 86;
    this.playfieldHeight = Math.max(120, size.height - 150);
    this.netWidth = Math.min(210, Math.max(126, size.width * 0.52));
    this.drawWater();
    if (this.activeEncounter && !this.finished) {
      this.encounterLabel?.setPosition(centerX, 14).setOrigin(0.5, 0);
      this.helpLabel?.setPosition(centerX, 48).setOrigin(0.5, 0);
      this.timerLabel?.setPosition(size.width - 18, size.height - 43).setOrigin(1, 0.5);
      this.progressLabel?.setPosition(18, size.height - 43).setOrigin(0, 0.5);
      this.feedbackLabel?.setPosition(centerX, this.playfieldTop + this.playfieldHeight * 0.5).setOrigin(0.5);
      this.renderFrame();
      return;
    }
    this.title?.setPosition(centerX, size.height / 2 - 42).setOrigin(0.5);
    this.subtitle?.setPosition(centerX, size.height / 2 + 34).setOrigin(0.5);
  }

  private removeListeners(): void {
    this.game.events.off("fishing:start", this.startEncounter, this);
    this.game.events.off("fishing:lobby", this.showLobby, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
  }
}
