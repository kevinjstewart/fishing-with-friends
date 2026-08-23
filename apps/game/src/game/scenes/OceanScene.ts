import type { FishingEncounterResponse } from "@fishing/shared";
import Phaser from "phaser";
import { createFishingState, performanceFor, seededRandom, stepFishing, type FishingState } from "../fishing-mechanics";

interface FishingCompleteEvent {
  encounterId: string;
  performance: number;
}

interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Mote {
  x: number;
  y: number;
  radius: number;
  speed: number;
  alpha: number;
  driftPhase: number;
}

interface Silhouette {
  x: number;
  y: number;
  speed: number;
  scale: number;
  direction: 1 | -1;
  phase: number;
}

interface Floater {
  text: Phaser.GameObjects.Text;
  busy: boolean;
}

interface FightLayout {
  headerX: number;
  headerY: number;
  headerW: number;
  headerH: number;
  bottomX: number;
  bottomY: number;
  bottomW: number;
  bottomH: number;
  trackX: number;
  trackTop: number;
  trackBottom: number;
  trackW: number;
}

const COLORS = {
  abyss: 0x030d17,
  deep: 0x061925,
  waterTop: 0x11516b,
  waterBottom: 0x04121f,
  foam: 0xbfe8df,
  net: 0xf4d58d,
  netActive: 0x8ef0c7,
  fish: 0xf4a261,
  fishLight: 0xffd28f,
  danger: 0xf06c62,
  ink: 0xfff4d6,
  dim: 0xa7c3d6,
  glass: 0x0a1b2b,
};

const RARITY_COLORS: Record<string, number> = {
  common: 0xcfe3ef,
  uncommon: 0x7ef0bd,
  rare: 0xa5cdff,
  legendary: 0xffe08a,
};

const DISPLAY_FONT = '"Sora", "Trebuchet MS", sans-serif';
const BODY_FONT = '"Inter", "Trebuchet MS", sans-serif';

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export class OceanScene extends Phaser.Scene {
  private safe: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  private mode: "ambient" | "fight" = "ambient";

  private readonly ambientObjects: Phaser.GameObjects.GameObject[] = [];
  private readonly fightObjects: Phaser.GameObjects.GameObject[] = [];
  private backdrop?: Phaser.GameObjects.Graphics;
  private rays?: Phaser.GameObjects.Graphics;
  private silhouettes?: Phaser.GameObjects.Graphics;
  private motesLayer?: Phaser.GameObjects.Graphics;
  private motes: Mote[] = [];
  private shoal: Silhouette[] = [];

  private encounter?: FishingEncounterResponse;
  private fishingState?: FishingState;
  private random = Math.random;
  private finished = false;
  private completedEmitted = false;
  private controlLocked = true;
  private insideStreak = 0;
  private lastProgress = 0;
  private warnedLowTime = false;
  private readonly heldPointers = new Set<number>();
  private keyboardHeld = false;

  private dimmer?: Phaser.GameObjects.Rectangle;
  private lane?: Phaser.GameObjects.Graphics;
  private net?: Phaser.GameObjects.Graphics;
  private fishContainer?: Phaser.GameObjects.Container;
  private fishBodyArt?: Phaser.GameObjects.Graphics;
  private fishTailArt?: Phaser.GameObjects.Graphics;
  private fishShadowArt?: Phaser.GameObjects.Graphics;
  private hudCard?: Phaser.GameObjects.Graphics;
  private hudEyebrow?: Phaser.GameObjects.Text;
  private hudSpecies?: Phaser.GameObjects.Text;
  private rarityPill?: Phaser.GameObjects.Graphics;
  private rarityLabel?: Phaser.GameObjects.Text;
  private timerRing?: Phaser.GameObjects.Graphics;
  private timerText?: Phaser.GameObjects.Text;
  private bottomCard?: Phaser.GameObjects.Graphics;
  private meterTitle?: Phaser.GameObjects.Text;
  private meterPercent?: Phaser.GameObjects.Text;
  private meterTrack?: Phaser.GameObjects.Graphics;
  private meterFill?: Phaser.GameObjects.Graphics;
  private holdHint?: Phaser.GameObjects.Text;
  private banner?: Phaser.GameObjects.Text;
  private bannerSub?: Phaser.GameObjects.Text;
  private readonly floaters: Floater[] = [];

  private box: FightLayout = { headerX: 0, headerY: 0, headerW: 0, headerH: 0, bottomX: 0, bottomY: 0, bottomW: 0, bottomH: 0, trackX: 0, trackTop: 0, trackBottom: 0, trackW: 0 };
  private ringRadius = 21;
  private showHudEyebrow = true;

  constructor() {
    super("OceanScene");
  }

  create(): void {
    this.input.mouse?.disableContextMenu();
    this.game.events.on("fight:start", this.enterFightMode, this);
    this.game.events.on("safearea:changed", this.refreshSafeArea, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.heldPointers.add(pointer.id));
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.heldPointers.delete(pointer.id));
    this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => this.heldPointers.delete(pointer.id));
    this.input.keyboard?.on("keydown-SPACE", () => {
      this.keyboardHeld = true;
    });
    this.input.keyboard?.on("keyup-SPACE", () => {
      this.keyboardHeld = false;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeListeners, this);

    this.buildAmbient();
    this.enterAmbientMode();
  }

  update(time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 20);
    this.updateAmbient(time / 1000, dt);
    if (this.mode !== "fight" || !this.encounter || !this.fishingState || this.finished) return;
    if (this.controlLocked) {
      this.renderFrame(true);
      return;
    }
    const held = this.heldPointers.size > 0 || this.keyboardHeld;
    const step = stepFishing(this.fishingState, held, dt, this.encounter.miniGame, this.encounter.species.movementProfile, this.random);
    this.fishingState = step.state;
    this.fishingState.wasInside = !step.leftNet && (step.enteredNet || step.state.wasInside);
    this.insideStreak = this.fishingState.wasInside ? this.insideStreak + dt : 0;
    const midY = this.box.trackTop + (this.box.trackBottom - this.box.trackTop) / 2;
    if (step.enteredNet) {
      this.spawnFloater("IN THE NET", COLORS.netActive, this.box.trackX, midY);
      navigator.vibrate?.(12);
    }
    if (step.leftNet) this.spawnFloater("SLIPPING!", COLORS.danger, this.box.trackX, midY);
    this.checkProgressMilestones();
    this.renderFrame(false);
    if (step.state.result !== "playing") this.finishEncounter(step.state.result);
  }

  private removeListeners(): void {
    this.game.events.off("fight:start", this.enterFightMode, this);
    this.game.events.off("safearea:changed", this.refreshSafeArea, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
  }

  private refreshSafeArea(): void {
    const stored = this.game.registry.get("safeArea") as SafeAreaInsets | undefined;
    if (stored) this.safe = stored;
    this.handleResize();
  }

  private handleResize(): void {
    const stored = this.game.registry.get("safeArea") as SafeAreaInsets | undefined;
    if (stored) this.safe = stored;
    this.drawBackdrop();
    this.scatterMotes();
    if (this.mode === "fight") {
      this.computeFightLayout();
      this.drawDimmer();
      this.drawLane();
      this.layoutHud();
      this.drawFishArt();
      this.renderFrame(true);
    }
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.fightObjects.push(object);
    return object;
  }

  private destroyFightObjects(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    for (const object of this.fightObjects) object.destroy();
    this.fightObjects.length = 0;
    this.floaters.length = 0;
    this.net = undefined;
    this.fishContainer = undefined;
    this.fishBodyArt = undefined;
    this.fishTailArt = undefined;
    this.fishShadowArt = undefined;
    this.dimmer = undefined;
    this.lane = undefined;
    this.hudCard = undefined;
    this.hudEyebrow = undefined;
    this.hudSpecies = undefined;
    this.rarityPill = undefined;
    this.rarityLabel = undefined;
    this.timerRing = undefined;
    this.timerText = undefined;
    this.bottomCard = undefined;
    this.meterTitle = undefined;
    this.meterPercent = undefined;
    this.meterTrack = undefined;
    this.meterFill = undefined;
    this.holdHint = undefined;
    this.banner = undefined;
    this.bannerSub = undefined;
  }

  private enterAmbientMode(): void {
    this.destroyFightObjects();
    this.mode = "ambient";
    this.encounter = undefined;
    this.fishingState = undefined;
    this.finished = false;
    this.completedEmitted = false;
    this.controlLocked = true;
    this.heldPointers.clear();
    this.keyboardHeld = false;
  }

  private enterFightMode(encounter: FishingEncounterResponse): void {
    this.destroyFightObjects();
    this.encounter = encounter;
    this.finished = false;
    this.completedEmitted = false;
    this.controlLocked = true;
    this.insideStreak = 0;
    this.lastProgress = 0;
    this.warnedLowTime = false;
    this.heldPointers.clear();
    this.keyboardHeld = false;
    this.random = seededRandom(encounter.difficultySeed);
    this.fishingState = createFishingState(this.random);
    this.mode = "fight";

    this.dimmer = this.track(this.add.rectangle(0, 0, 1, 1, COLORS.abyss, 0.34).setOrigin(0).setDepth(5));
    this.lane = this.track(this.add.graphics().setDepth(6));
    this.fishShadowArt = this.track(this.add.graphics().setDepth(7));
    this.net = this.track(this.add.graphics().setDepth(8));
    this.fishTailArt = this.track(this.add.graphics().setDepth(9));
    this.fishBodyArt = this.track(this.add.graphics().setDepth(10));
    this.fishContainer = this.track(this.add.container(0, 0, [this.fishTailArt, this.fishBodyArt]).setDepth(9));

    this.buildHud();
    this.handleResize();
    this.playIntroSequence();
  }

  private buildAmbient(): void {
    const stored = this.game.registry.get("safeArea") as SafeAreaInsets | undefined;
    if (stored) this.safe = stored;
    this.backdrop = this.add.graphics().setDepth(0);
    this.rays = this.add.graphics().setDepth(1);
    this.silhouettes = this.add.graphics().setDepth(2);
    this.motesLayer = this.add.graphics().setDepth(3);
    this.ambientObjects.push(this.backdrop, this.rays, this.silhouettes, this.motesLayer);
    this.shoal = [
      { x: this.scale.width * 0.3, y: this.scale.height * 0.34, speed: 11, scale: 1.15, direction: 1, phase: 0 },
      { x: this.scale.width * 0.7, y: this.scale.height * 0.58, speed: 8, scale: 0.85, direction: -1, phase: 2.1 },
      { x: this.scale.width * 0.5, y: this.scale.height * 0.78, speed: 14, scale: 0.65, direction: 1, phase: 4.4 },
    ];
    this.drawBackdrop();
    this.scatterMotes();
  }

  private drawBackdrop(): void {
    if (!this.backdrop) return;
    const width = this.scale.width;
    const height = this.scale.height;
    this.backdrop.clear();
    const bands = 26;
    const bandHeight = Math.ceil(height / bands);
    for (let index = 0; index < bands; index += 1) {
      const shade = mix(COLORS.waterTop, COLORS.waterBottom, index / (bands - 1));
      this.backdrop.fillStyle(shade, 1).fillRect(0, index * bandHeight, width, bandHeight + 1);
    }
    this.backdrop.fillStyle(COLORS.deep, 0.5).fillRect(0, height * 0.86, width, height * 0.14);
  }

  private scatterMotes(): void {
    const target = Math.round(Math.min(34, Math.max(16, this.scale.width / 14)));
    this.motes = Array.from({ length: target }, () => this.makeMote(true));
  }

  private makeMote(anywhere: boolean): Mote {
    return {
      x: Math.random() * this.scale.width,
      y: anywhere ? Math.random() * this.scale.height : this.scale.height + 12,
      radius: 0.8 + Math.random() * 2.1,
      speed: 7 + Math.random() * 16,
      alpha: 0.08 + Math.random() * 0.16,
      driftPhase: Math.random() * Math.PI * 2,
    };
  }

  private updateAmbient(now: number, dt: number): void {
    const width = this.scale.width;
    const height = this.scale.height;
    this.rays?.clear();
    if (this.rays) {
      for (let index = 0; index < 4; index += 1) {
        const sway = Math.sin(now * 0.18 + index * 1.7) * width * 0.05;
        const baseX = ((index + 0.5) / 4) * width;
        const beamWidth = width * (0.05 + (index % 2) * 0.025);
        const alpha = 0.035 + 0.025 * (0.5 + 0.5 * Math.sin(now * 0.35 + index * 2.3));
        this.rays.fillStyle(COLORS.foam, alpha);
        this.rays.beginPath();
        this.rays.moveTo(baseX - beamWidth, -4);
        this.rays.lineTo(baseX + beamWidth, -4);
        this.rays.lineTo(baseX + beamWidth + width * 0.07 + sway, height * 0.62);
        this.rays.lineTo(baseX - beamWidth + width * 0.02 + sway, height * 0.62);
        this.rays.closePath();
        this.rays.fillPath();
      }
      this.rays.fillStyle(COLORS.foam, 0.05).fillEllipse(width * 0.5, 6, width * 0.9, 46);
    }
    this.silhouettes?.clear();
    for (const member of this.shoal) {
      member.x += member.speed * member.direction * dt;
      if (member.direction === 1 && member.x > width + 70) member.x = -70;
      if (member.direction === -1 && member.x < -70) member.x = width + 70;
      const bob = Math.sin(now * 0.9 + member.phase) * 6;
      this.drawSilhouette(member.x, member.y + bob, member.scale, member.direction === -1);
    }
    this.motesLayer?.clear();
    for (const mote of this.motes) {
      mote.y -= mote.speed * dt;
      if (mote.y < -12) Object.assign(mote, this.makeMote(false));
      const driftX = Math.sin(now * 1.4 + mote.driftPhase) * 5;
      this.motesLayer?.lineStyle(1, COLORS.foam, mote.alpha).strokeCircle(mote.x + driftX, mote.y, mote.radius);
    }
  }

  private drawSilhouette(x: number, y: number, scale: number, flipped: boolean): void {
    if (!this.silhouettes) return;
    const g = this.silhouettes;
    g.fillStyle(0x02101c, 0.5);
    g.save();
    g.translateCanvas(x, y);
    g.scaleCanvas(flipped ? -scale : scale, scale);
    g.fillEllipse(0, 0, 64, 20);
    g.fillTriangle(-30, 0, -48, -12, -46, 12);
    g.restore();
  }

  private computeFightLayout(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const compact = height < 560;
    const sideInset = (side: "left" | "right") => Math.max(12, this.safe[side] + 12);
    const left = sideInset("left");
    const right = sideInset("right");
    const top = this.safe.top + (compact ? 8 : 12);
    const headerH = compact ? 66 : 76;
    const bottomH = compact ? 96 : 114;
    this.box = {
      headerX: left,
      headerY: top,
      headerW: width - left - right,
      headerH,
      bottomX: left,
      bottomY: height - this.safe.bottom - (compact ? 8 : 10) - bottomH,
      bottomW: width - left - right,
      bottomH,
      trackX: width / 2,
      trackTop: top + headerH + (compact ? 10 : 18),
      trackBottom: height - this.safe.bottom - (compact ? 8 : 10) - bottomH - (compact ? 10 : 18),
      trackW: Math.min(Math.max(width * 0.6, 210), 340),
    };
  }

  private drawDimmer(): void {
    this.dimmer?.setSize(this.scale.width, this.scale.height).setPosition(0, 0);
  }

  private drawLane(): void {
    if (!this.lane) return;
    const { trackX, trackTop, trackBottom, trackW } = this.box;
    const halfW = trackW / 2;
    this.lane.clear();
    this.lane.fillStyle(COLORS.foam, 0.028).fillRoundedRect(trackX - halfW, trackTop, trackW, trackBottom - trackTop, 22);
    this.lane.lineStyle(1, COLORS.foam, 0.16);
    for (let y = trackTop + 8; y < trackBottom - 4; y += 16) {
      this.lane.lineBetween(trackX - halfW, y, trackX - halfW, Math.min(y + 8, trackBottom));
      this.lane.lineBetween(trackX + halfW, y, trackX + halfW, Math.min(y + 8, trackBottom));
    }
    this.lane.lineStyle(1, COLORS.foam, 0.1);
    for (let step = 1; step < 10; step += 1) {
      const y = trackTop + ((trackBottom - trackTop) * step) / 10;
      this.lane.lineBetween(trackX - halfW - 7, y, trackX - halfW - 2, y);
      this.lane.lineBetween(trackX + halfW + 2, y, trackX + halfW + 7, y);
    }
    for (let wave = 0; wave < 3; wave += 1) {
      const y = trackTop - 10 + wave * 5;
      const spread = 26 - wave * 6;
      this.lane.lineStyle(2 - wave * 0.5, COLORS.foam, 0.22 - wave * 0.05);
      this.lane.beginPath();
      this.lane.moveTo(trackX - spread, y);
      this.lane.lineTo(trackX - spread * 0.3, y - 3);
      this.lane.lineTo(trackX + spread * 0.3, y);
      this.lane.lineTo(trackX + spread, y - 3);
      this.lane.strokePath();
    }
  }

  private buildHud(): void {
    const encounter = this.encounter;
    if (!encounter) return;
    this.hudCard = this.track(this.add.graphics().setDepth(12));
    this.timerRing = this.track(this.add.graphics().setDepth(13));
    this.hudEyebrow = this.track(
      this.add
        .text(0, 0, `${encounter.locationName.toUpperCase()} · FISH ON`, {
          fontFamily: BODY_FONT,
          fontSize: "10px",
          fontStyle: "bold",
          color: hex(COLORS.netActive),
          letterSpacing: 2,
        })
        .setDepth(13),
    );
    this.hudSpecies = this.track(
      this.add.text(0, 0, "", { fontFamily: DISPLAY_FONT, fontSize: "20px", fontStyle: "bold", color: "#fff4d6", stroke: "#04101c", strokeThickness: 3 }).setDepth(13),
    );
    this.rarityPill = this.track(this.add.graphics().setDepth(13));
    this.rarityLabel = this.track(
      this.add.text(0, 0, encounter.species.rarity.toUpperCase(), { fontFamily: BODY_FONT, fontSize: "9px", fontStyle: "bold", color: hex(RARITY_COLORS[encounter.species.rarity] ?? COLORS.dim), letterSpacing: 1.5 }).setDepth(14),
    );
    this.timerText = this.track(this.add.text(0, 0, "", { fontFamily: DISPLAY_FONT, fontSize: "13px", fontStyle: "bold", color: "#fff4d6" }).setOrigin(0.5).setDepth(14));

    this.bottomCard = this.track(this.add.graphics().setDepth(12));
    this.meterTitle = this.track(
      this.add.text(0, 0, "NET CONTROL", { fontFamily: BODY_FONT, fontSize: "10px", fontStyle: "bold", color: hex(COLORS.dim), letterSpacing: 2 }).setDepth(13),
    );
    this.meterPercent = this.track(this.add.text(0, 0, "", { fontFamily: DISPLAY_FONT, fontSize: "14px", fontStyle: "bold", color: "#fff4d6" }).setDepth(13));
    this.meterTrack = this.track(this.add.graphics().setDepth(13));
    this.meterFill = this.track(this.add.graphics().setDepth(14));
    this.holdHint = this.track(
      this.add
        .text(0, 0, "HOLD ANYWHERE TO LIFT · RELEASE TO DROP", { fontFamily: BODY_FONT, fontSize: "10px", fontStyle: "bold", color: hex(COLORS.foam), letterSpacing: 1.5 })
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(13),
    );

    this.banner = this.track(
      this.add
        .text(0, 0, "", {
          fontFamily: DISPLAY_FONT,
          fontSize: `${Math.round(Math.min(46, this.scale.width * 0.11))}px`,
          fontStyle: "bold",
          color: "#fff7dd",
          stroke: "#04101c",
          strokeThickness: 8,
          align: "center",
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(20),
    );
    this.bannerSub = this.track(
      this.add
        .text(0, 0, "", { fontFamily: BODY_FONT, fontSize: "14px", fontStyle: "bold", color: hex(COLORS.netActive), stroke: "#04101c", strokeThickness: 4, align: "center" })
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(20),
    );
  }

  private layoutHud(): void {
    const encounter = this.encounter;
    if (!encounter || !this.hudCard || !this.hudEyebrow || !this.hudSpecies || !this.rarityPill || !this.rarityLabel || !this.timerRing || !this.timerText || !this.bottomCard || !this.meterTitle || !this.meterPercent || !this.meterTrack || !this.holdHint) return;
    const { headerX, headerY, headerW, headerH, bottomX, bottomY, bottomW, bottomH } = this.box;
    const radius = Math.min(18, headerH / 2);
    this.hudCard.clear();
    this.hudCard.fillStyle(COLORS.glass, 0.66).fillRoundedRect(headerX, headerY, headerW, headerH, radius);
    this.hudCard.lineStyle(1, COLORS.foam, 0.22).strokeRoundedRect(headerX, headerY, headerW, headerH, radius);
    this.hudCard.fillStyle(COLORS.glass, 0.66).fillRoundedRect(bottomX, bottomY, bottomW, bottomH, radius);
    this.hudCard.lineStyle(1, COLORS.foam, 0.22).strokeRoundedRect(bottomX, bottomY, bottomW, bottomH, radius);

    const padX = headerX + 16;
    this.showHudEyebrow = headerH > 70;
    this.hudEyebrow.setVisible(this.showHudEyebrow);
    if (this.showHudEyebrow) this.hudEyebrow.setPosition(padX, headerY + 11);
    this.ringRadius = headerH > 70 ? 21 : 18;
    const ringX = headerX + headerW - this.ringRadius - 16;
    const ringY = headerY + headerH / 2;
    this.timerRing.setPosition(ringX, ringY);
    this.timerText.setPosition(ringX, ringY);
    const maxNameWidth = ringX - 14 - padX;
    const nameSize = Math.max(15, Math.min(headerH > 70 ? 20 : 17, Math.floor(maxNameWidth / Math.max(8, encounter.species.commonName.length) / 0.58)));
    this.hudSpecies.setFontSize(nameSize).setText(encounter.species.commonName).setPosition(padX, headerY + (this.showHudEyebrow ? 28 : 12));
    const rarityColor = RARITY_COLORS[encounter.species.rarity] ?? COLORS.dim;
    this.rarityLabel.setColor(hex(rarityColor));
    const pillHeight = 16;
    const pillWidth = this.rarityLabel.width + 16;
    const pillY = Math.min(this.hudSpecies.y + this.hudSpecies.height + 4, headerY + headerH - pillHeight - 7);
    this.rarityLabel.setPosition(padX + 2, pillY + (pillHeight - this.rarityLabel.height) / 2 - 1);
    this.rarityPill.clear();
    this.rarityPill.fillStyle(rarityColor, 0.14).fillRoundedRect(padX - 6, pillY, pillWidth, pillHeight, pillHeight / 2);
    this.rarityPill.lineStyle(1, rarityColor, 0.45).strokeRoundedRect(padX - 6, pillY, pillWidth, pillHeight, pillHeight / 2);

    const meterX = bottomX + 16;
    const meterW = bottomW - 32;
    const titleY = bottomY + 12;
    this.meterTitle.setPosition(meterX, titleY);
    this.meterPercent.setPosition(bottomX + bottomW - 16, titleY - 2).setOrigin(1, 0);
    const meterY = titleY + 20;
    this.meterTrack.clear();
    this.meterTrack.fillStyle(0x031017, 0.78).fillRoundedRect(meterX, meterY, meterW, 14, 7);
    this.meterTrack.lineStyle(1, COLORS.foam, 0.25).strokeRoundedRect(meterX, meterY, meterW, 14, 7);
    this.meterTrack.lineStyle(1, COLORS.foam, 0.2);
    for (const fraction of [0.25, 0.5, 0.75]) {
      const tickX = meterX + meterW * fraction;
      this.meterTrack.lineBetween(tickX, meterY + 2, tickX, meterY + 12);
    }
    this.holdHint.setPosition(this.scale.width / 2, bottomY + bottomH - 18);
  }

  private drawFishArt(): void {
    if (!this.fishBodyArt || !this.fishTailArt || !this.encounter || !this.net) return;
    const netW = this.netWidth();
    const bodyLength = Phaser.Math.Clamp(netW * 0.3, 32, 56);
    const bodyHeight = bodyLength * 0.48;
    this.fishBodyArt.clear();
    this.fishBodyArt.fillStyle(COLORS.fish, 1).fillTriangle(bodyLength * 0.28, 0, bodyLength * 0.52, -bodyHeight * 0.42, bodyLength * 0.52, bodyHeight * 0.42);
    this.fishBodyArt.fillEllipse(0, 0, bodyLength, bodyHeight);
    this.fishBodyArt.fillStyle(mix(COLORS.fish, COLORS.fishLight, 0.55), 0.85).fillTriangle(bodyLength * 0.02, -bodyHeight * 0.36, bodyLength * 0.16, -bodyHeight * 0.82, bodyLength * 0.24, -bodyHeight * 0.3);
    this.fishBodyArt.fillStyle(COLORS.fishLight, 0.7).fillEllipse(bodyLength * 0.06, -bodyHeight * 0.14, bodyLength * 0.44, bodyHeight * 0.3);
    this.fishBodyArt.fillStyle(0x102530, 1).fillCircle(bodyLength * 0.31, -bodyHeight * 0.14, Math.max(2, bodyLength * 0.05));
    this.fishBodyArt.lineStyle(2, 0xffe5b0, 0.6).strokeEllipse(0, 0, bodyLength, bodyHeight);
    this.fishTailArt.clear();
    this.fishTailArt.fillStyle(COLORS.fish, 1).fillTriangle(0, 0, -bodyLength * 0.34, -bodyHeight * 0.52, -bodyLength * 0.34, bodyHeight * 0.52);
    this.fishTailArt.fillStyle(COLORS.fishLight, 0.4).fillTriangle(0, 0, -bodyLength * 0.22, -bodyHeight * 0.3, -bodyLength * 0.22, bodyHeight * 0.3);
  }

  private netWidth(): number {
    return Phaser.Math.Clamp(this.box.trackW * 0.6, 116, 196);
  }

  private drawNet(active: boolean): void {
    if (!this.net || !this.encounter) return;
    const playfieldH = this.box.trackBottom - this.box.trackTop;
    const width = this.netWidth();
    const height = Math.max(30, playfieldH * this.encounter.miniGame.catchZoneSize);
    const color = active ? COLORS.netActive : COLORS.net;
    this.net.clear();
    this.net.fillStyle(color, active ? 0.2 : 0.09).fillEllipse(0, 0, width, height);
    this.net.lineStyle(active ? 4 : 3, color, active ? 1 : 0.85).strokeEllipse(0, 0, width, height);
    this.net.lineStyle(1, color, active ? 0.5 : 0.26);
    for (let x = -width * 0.32; x <= width * 0.32; x += width * 0.16) this.net.lineBetween(x, -height * 0.38, x, height * 0.38);
    for (let y = -height * 0.24; y <= height * 0.24; y += Math.max(9, height * 0.16)) this.net.lineBetween(-width * 0.43, y, width * 0.43, y);
    this.net.lineStyle(7, 0x8b6440, 1).lineBetween(width / 2 - 2, 0, width / 2 + 62, 24);
    this.net.lineStyle(2, 0xd7aa6d, 0.8).lineBetween(width / 2 + 1, -2, width / 2 + 62, 21);
    if (active) {
      this.net.lineStyle(2, color, 0.5).strokeEllipse(0, 0, width + 14, height + 12);
    }
  }

  private renderFrame(idleBob: boolean): void {
    if (!this.fishingState || !this.encounter || !this.fishContainer || !this.fishShadowArt || !this.net) return;
    const state = this.fishingState;
    const playfieldH = this.box.trackBottom - this.box.trackTop;
    const bob = idleBob ? Math.sin(state.elapsed * 2.4) * 4 : 0;
    const netY = this.box.trackTop + playfieldH * state.netPosition;
    const fishY = this.box.trackTop + playfieldH * state.fishPosition + bob;
    this.drawNet(state.wasInside);
    const pulse = 1 + Math.min(this.insideStreak, 0.5) * 0.05;
    this.net.setPosition(this.box.trackX, netY).setScale(pulse);
    this.fishContainer.setPosition(this.box.trackX - this.netWidth() * 0.12, fishY);
    this.fishContainer.setRotation(state.fishVelocity * 0.4);
    this.fishContainer.setScale(state.fishVelocity < 0 ? -1 : 1, 1);
    const tailWag = Math.sin(state.elapsed * (7 + this.encounter.species.movementProfile.speed * 6)) * 0.45;
    if (this.fishTailArt) this.fishTailArt.setRotation(tailWag * (state.fishVelocity < 0 ? -1 : 1));
    this.fishShadowArt.setPosition(this.box.trackX - this.netWidth() * 0.12 + 6, fishY + 12);
    this.fishShadowArt.setScale(state.fishVelocity < 0 ? -1 : 1, 1);
    this.fishShadowArt.clear();
    this.fishShadowArt.fillStyle(0x01080e, 0.3).fillEllipse(0, 0, this.netWidth() * 0.34, 9);
    this.renderTimer();
    this.renderMeter();
  }

  private renderTimer(): void {
    if (!this.timerRing || !this.timerText || !this.encounter || !this.fishingState) return;
    const total = this.encounter.miniGame.durationSeconds;
    const remaining = Math.max(0, total - this.fishingState.elapsed);
    const fraction = this.controlLocked ? 1 : remaining / total;
    this.timerRing.clear();
    this.timerRing.lineStyle(4, COLORS.foam, 0.14).strokeCircle(0, 0, this.ringRadius);
    const hue = fraction > 0.5 ? mix(COLORS.netActive, 0xffd166, (1 - fraction) * 2) : mix(0xffd166, COLORS.danger, (0.5 - fraction) * 2);
    if (fraction > 0.001) {
      this.timerRing.lineStyle(4, hue, 0.95);
      this.timerRing.beginPath();
      this.timerRing.arc(0, 0, this.ringRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction);
      this.timerRing.strokePath();
    }
    this.timerText.setText(`${remaining.toFixed(0)}`).setColor(fraction <= 0.25 && !this.controlLocked ? hex(COLORS.danger) : "#fff4d6");
    if (!this.controlLocked && remaining <= 3.05 && !this.warnedLowTime) {
      this.warnedLowTime = true;
      navigator.vibrate?.(18);
      this.tweens.add({ targets: this.timerText, scale: 1.35, duration: 130, yoyo: true, ease: "Quad.easeOut" });
    }
  }

  private renderMeter(): void {
    if (!this.meterFill || !this.meterPercent || !this.fishingState) return;
    const { bottomX, bottomW } = this.box;
    const meterX = bottomX + 16;
    const meterW = bottomW - 32;
    const meterY = (this.meterTitle?.y ?? 0) + 20;
    this.meterFill.clear();
    const progress = this.fishingState.progress;
    const fillColor = progress < 0.2 ? COLORS.danger : progress > 0.72 ? COLORS.netActive : COLORS.net;
    this.meterFill.fillStyle(fillColor, 1).fillRoundedRect(meterX, meterY, Math.max(progress > 0 ? 10 : 0, meterW * progress), 14, 7);
    if (progress > 0.02) {
      this.meterFill.fillStyle(0xffffff, 0.4).fillCircle(meterX + Math.max(10, meterW * progress) - 7, meterY + 7, 2.4);
    }
    this.meterPercent.setText(`${Math.round(progress * 100)}%`).setColor(hex(fillColor));
  }

  private checkProgressMilestones(): void {
    if (!this.fishingState) return;
    const progress = this.fishingState.progress;
    if (this.lastProgress < 0.5 && progress >= 0.5) this.spawnFloater("HALFWAY!", COLORS.net, this.box.trackX, this.box.trackTop + 34);
    if (this.lastProgress < 0.8 && progress >= 0.8) this.spawnFloater("ALMOST!", COLORS.netActive, this.box.trackX, this.box.trackTop + 34);
    this.lastProgress = progress;
  }

  private spawnFloater(message: string, color: number, x: number, y: number): void {
    let floater = this.floaters.find((candidate) => !candidate.busy);
    if (!floater) {
      if (this.floaters.length >= 6) return;
      const text = this.track(this.add.text(0, 0, "", { fontFamily: BODY_FONT, fontSize: "13px", fontStyle: "bold", stroke: "#04101c", strokeThickness: 4 }).setOrigin(0.5).setDepth(18).setAlpha(0));
      floater = { text, busy: false };
      this.floaters.push(floater);
    }
    floater.busy = true;
    floater.text.setText(message).setColor(hex(color)).setPosition(x, y).setAlpha(1).setScale(0.85);
    this.tweens.killTweensOf(floater.text);
    this.tweens.add({
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

  private burstSparkles(x: number, y: number, color: number): void {
    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2 + Math.random() * 0.5;
      const distance = 34 + Math.random() * 46;
      const spark = this.track(this.add.circle(x, y, 2 + Math.random() * 2.4, color, 0.95).setDepth(19));
      this.tweens.add({
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

  private playIntroSequence(): void {
    if (!this.banner || !this.bannerSub || !this.encounter) return;
    const centerX = this.scale.width / 2;
    const centerY = (this.box.trackTop + this.box.trackBottom) / 2;
    this.tweens.killTweensOf([this.banner, this.bannerSub]);
    this.banner.setText("FISH ON!").setColor("#fff7dd").setPosition(centerX, centerY - 14).setAlpha(0).setScale(0.5);
    this.bannerSub.setText(`${this.encounter.species.commonName} took your bait!`).setPosition(centerX, centerY + 26).setAlpha(0);
    navigator.vibrate?.([14, 60, 22]);
    this.burstSparkles(centerX, centerY, COLORS.foam);
    this.tweens.add({ targets: this.banner, alpha: 1, scale: 1, duration: 300, ease: "Back.easeOut" });
    this.tweens.add({ targets: this.bannerSub, alpha: 1, duration: 260, delay: 260 });
    this.holdHint?.setAlpha(0.5);
    this.time.delayedCall(1050, () => {
      if (this.mode !== "fight") return;
      this.tweens.add({ targets: [this.banner, this.bannerSub], alpha: 0, y: "-=18", duration: 280, ease: "Cubic.easeIn" });
    });
    this.time.delayedCall(1200, () => {
      if (this.mode !== "fight") return;
      this.banner?.setText("GO!").setColor(hex(COLORS.netActive)).setAlpha(0).setScale(0.8);
      this.tweens.add({ targets: this.banner, alpha: 1, scale: 1.1, duration: 180, ease: "Back.easeOut" });
      this.tweens.add({ targets: this.banner, alpha: 0, duration: 200, delay: 180, ease: "Cubic.easeIn" });
      navigator.vibrate?.(20);
    });
    this.time.delayedCall(1380, () => {
      if (this.mode !== "fight") return;
      this.controlLocked = false;
      this.showHoldHintPulse();
    });
  }

  private showHoldHintPulse(): void {
    if (!this.holdHint) return;
    this.tweens.add({ targets: this.holdHint, alpha: 0.35, duration: 620, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
  }

  private resetBanners(): void {
    if (!this.banner || !this.bannerSub) return;
    this.tweens.killTweensOf([this.banner, this.bannerSub]);
    this.banner.setAlpha(0).setScale(1);
    this.bannerSub.setAlpha(0);
  }

  private finishEncounter(result: "caught" | "lost"): void {
    if (!this.activeEncounterReady()) return;
    this.finished = true;
    const state = this.fishingState;
    if (!state || !this.encounter) return;
    const event: FishingCompleteEvent = { encounterId: this.encounter.encounterId, performance: performanceFor(state) };
    const centerX = this.scale.width / 2;
    const centerY = (this.box.trackTop + this.box.trackBottom) / 2;
    if (result === "caught") {
      navigator.vibrate?.([25, 35, 60]);
      this.cameras.main.flash(200, 168, 250, 216, false);
      this.resetBanners();
      this.banner?.setText("LANDED!").setColor("#eafff4").setPosition(centerX, centerY).setAlpha(0).setScale(0.55);
      this.bannerSub?.setText("Reeled it in").setPosition(centerX, centerY + 30).setAlpha(0);
      if (this.banner && this.bannerSub) {
        this.tweens.add({ targets: this.banner, alpha: 1, scale: 1, duration: 300, ease: "Back.easeOut" });
        this.tweens.add({ targets: this.bannerSub, alpha: 1, duration: 240, delay: 160 });
      }
      this.burstSparkles(centerX, centerY, COLORS.netActive);
      this.burstSparkles(centerX, centerY, COLORS.net);
      this.tweens.add({ targets: [this.net, this.fishContainer], scale: 1.18, alpha: 0, delay: 160, duration: 400, ease: "Back.easeIn" });
    } else {
      navigator.vibrate?.(45);
      this.cameras.main.shake(220, 0.006);
      this.resetBanners();
      this.banner?.setText("IT GOT AWAY…").setColor("#ffd7cf").setPosition(centerX, centerY).setAlpha(0).setScale(0.7);
      this.bannerSub?.setText("It slipped the net").setPosition(centerX, centerY + 30).setAlpha(0);
      if (this.banner && this.bannerSub) {
        this.tweens.add({ targets: this.banner, alpha: 1, scale: 1, duration: 280, ease: "Quad.easeOut" });
        this.tweens.add({ targets: this.bannerSub, alpha: 1, duration: 220, delay: 140 });
      }
      if (this.fishContainer) {
        this.tweens.add({ targets: this.fishContainer, x: this.scale.width + 90, scaleX: 1.35, duration: 420, ease: "Cubic.easeIn" });
      }
      if (this.net) this.tweens.add({ targets: this.net, alpha: 0.35, duration: 300 });
    }
    this.time.delayedCall(result === "caught" ? 820 : 680, () => {
      if (this.completedEmitted) return;
      this.completedEmitted = true;
      this.game.events.emit("fishing:complete", event);
    });
    this.time.delayedCall(1500, () => {
      if (this.completedEmitted) this.enterAmbientMode();
    });
  }

  private activeEncounterReady(): boolean {
    return Boolean(this.encounter && this.fishingState) && !this.finished && this.mode === "fight";
  }
}
