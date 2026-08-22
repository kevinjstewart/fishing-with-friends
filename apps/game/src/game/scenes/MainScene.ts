import type { FishingEncounterResponse } from "@fishing/shared";
import Phaser from "phaser";

interface FishingCompleteEvent {
  encounterId: string;
  performance: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export class MainScene extends Phaser.Scene {
  private title?: Phaser.GameObjects.Text;
  private subtitle?: Phaser.GameObjects.Text;
  private encounterLabel?: Phaser.GameObjects.Text;
  private helpLabel?: Phaser.GameObjects.Text;
  private progressLabel?: Phaser.GameObjects.Text;
  private zone?: Phaser.GameObjects.Rectangle;
  private fish?: Phaser.GameObjects.Ellipse;
  private progressBar?: Phaser.GameObjects.Rectangle;
  private activeEncounter?: FishingEncounterResponse;
  private zonePosition = 0.5;
  private fishPosition = 0.5;
  private progress = 0.35;
  private elapsedSeconds = 0;
  private insideSeconds = 0;
  private inputHeld = false;
  private finished = false;

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
    this.showLobby();
  }

  update(_time: number, delta: number): void {
    if (!this.activeEncounter || this.finished) return;

    const seconds = delta / 1000;
    const profile = this.activeEncounter.species.movementProfile;
    this.elapsedSeconds += seconds;
    const fishWave = Math.sin(this.elapsedSeconds * (2.2 + profile.speed * 3.2)) * (0.2 + profile.unpredictability * 0.08);
    const fishBurst = Math.sin(this.elapsedSeconds * (5.1 + profile.directionChangeFrequency * 4.2) + 1.7) * profile.acceleration * 0.08;
    this.fishPosition = clamp(0.5 + fishWave + fishBurst, 0.08, 0.92);

    const controlSpeed = 0.72 + (this.activeEncounter.miniGame.catchZoneSize * 0.5);
    this.zonePosition = clamp(this.zonePosition + (this.inputHeld ? -controlSpeed : controlSpeed * 0.56) * seconds, 0.08, 0.92);
    const inside = Math.abs(this.fishPosition - this.zonePosition) <= this.activeEncounter.miniGame.catchZoneSize / 2;
    if (inside) {
      this.insideSeconds += seconds;
      this.progress += this.activeEncounter.miniGame.catchMeterGainRate * seconds;
    } else {
      this.progress -= this.activeEncounter.miniGame.catchMeterLossRate * seconds;
    }
    this.progress = clamp(this.progress, 0, 1);

    if (this.progress >= 1) {
      this.finishEncounter();
    } else if (this.progress <= 0 || this.elapsedSeconds >= this.activeEncounter.miniGame.durationSeconds) {
      this.finishEncounter();
    }
    this.layout({ width: this.scale.width, height: this.scale.height });
  }

  private showLobby(): void {
    this.activeEncounter = undefined;
    this.finished = false;
    this.children.removeAll(true);
    this.title = this.add.text(0, 0, "Fishing with Friends", {
      color: "#f6fbff",
      fontFamily: "system-ui, sans-serif",
      fontSize: "28px",
      fontStyle: "bold",
    });
    this.subtitle = this.add.text(0, 0, "Choose a lake below to prepare your first cast", {
      color: "#a8c2d9",
      fontFamily: "system-ui, sans-serif",
      fontSize: "16px",
    });
    this.layout({ width: this.scale.width, height: this.scale.height });
  }

  private startEncounter(encounter: FishingEncounterResponse): void {
    this.activeEncounter = encounter;
    this.finished = false;
    this.zonePosition = 0.72;
    this.fishPosition = 0.32;
    this.progress = 0.35;
    this.elapsedSeconds = 0;
    this.insideSeconds = 0;
    this.inputHeld = false;
    this.children.removeAll(true);

    this.encounterLabel = this.add.text(0, 0, `${encounter.species.commonName} · ${encounter.locationName}`, {
      color: "#f6fbff",
      fontFamily: "system-ui, sans-serif",
      fontSize: "22px",
      fontStyle: "bold",
    });
    this.helpLabel = this.add.text(0, 0, "Hold the screen, mouse, or Space to move the net up", {
      color: "#a8c2d9",
      fontFamily: "system-ui, sans-serif",
      fontSize: "14px",
    });
    this.progressLabel = this.add.text(0, 0, "Catch progress", {
      color: "#dffbfa",
      fontFamily: "system-ui, sans-serif",
      fontSize: "13px",
    });
    this.zone = this.add.rectangle(0, 0, 110, 80, 0x4bd3ca, 0.26).setStrokeStyle(2, 0x78d9d5, 0.9);
    this.fish = this.add.ellipse(0, 0, 34, 18, 0xf6d691, 1).setStrokeStyle(2, 0xfff2c4, 0.9);
    this.progressBar = this.add.rectangle(0, 0, 10, 10, 0x78d9d5, 1).setOrigin(0, 0.5);
    this.layout({ width: this.scale.width, height: this.scale.height });
  }

  private finishEncounter(): void {
    if (!this.activeEncounter || this.finished) return;
    this.finished = true;
    const duration = Math.max(this.elapsedSeconds, 0.1);
    const trackingPerformance = this.insideSeconds / duration;
    const performance = clamp((this.progress + trackingPerformance) / 2, 0, 1);
    const result: FishingCompleteEvent = { encounterId: this.activeEncounter.encounterId, performance };
    this.game.events.emit("fishing:complete", result);
  }

  private setInputHeld(): void {
    this.inputHeld = true;
  }

  private setInputReleased(): void {
    this.inputHeld = false;
  }

  private layout(size: { width: number; height: number }): void {
    const centerX = size.width / 2;
    if (this.activeEncounter && !this.finished) {
      const playfieldTop = 74;
      const playfieldHeight = Math.max(140, size.height - 128);
      const playfieldX = centerX;
      this.encounterLabel?.setPosition(centerX, 18).setOrigin(0.5);
      this.helpLabel?.setPosition(centerX, 48).setOrigin(0.5);
      this.zone?.setPosition(playfieldX, playfieldTop + playfieldHeight * this.zonePosition).setSize(Math.min(220, size.width * 0.5), playfieldHeight * this.activeEncounter.miniGame.catchZoneSize);
      this.fish?.setPosition(playfieldX, playfieldTop + playfieldHeight * this.fishPosition);
      this.progressLabel?.setPosition(18, size.height - 38);
      this.progressBar?.setPosition(18, size.height - 18).setSize(Math.max(8, (size.width - 36) * this.progress), 10);
      return;
    }

    this.title?.setPosition(centerX, size.height / 2 - 18).setOrigin(0.5);
    this.subtitle?.setPosition(centerX, size.height / 2 + 24).setOrigin(0.5);
  }
}
