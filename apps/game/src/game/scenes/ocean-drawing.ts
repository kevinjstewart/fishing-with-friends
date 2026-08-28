import type { FishingEncounterResponse } from "@fishing/shared/contracts";
import Phaser from "phaser";
import type { FishingState } from "../fishing-mechanics";
import { netWidth, type FightLayout } from "./ocean-layout";

export interface TrackObject {
  <T extends Phaser.GameObjects.GameObject>(object: T): T;
}

export interface OceanFightView {
  dimmer: Phaser.GameObjects.Rectangle;
  lane: Phaser.GameObjects.Graphics;
  net: Phaser.GameObjects.Graphics;
  fishContainer: Phaser.GameObjects.Container;
  fishBodyArt: Phaser.GameObjects.Graphics;
  fishTailArt: Phaser.GameObjects.Graphics;
  fishShadowArt: Phaser.GameObjects.Graphics;
  hudCard: Phaser.GameObjects.Graphics;
  hudEyebrow: Phaser.GameObjects.Text;
  hudSpecies: Phaser.GameObjects.Text;
  rarityPill: Phaser.GameObjects.Graphics;
  rarityLabel: Phaser.GameObjects.Text;
  timerRing: Phaser.GameObjects.Graphics;
  timerText: Phaser.GameObjects.Text;
  bottomCard: Phaser.GameObjects.Graphics;
  meterTitle: Phaser.GameObjects.Text;
  meterPercent: Phaser.GameObjects.Text;
  meterTrack: Phaser.GameObjects.Graphics;
  meterFill: Phaser.GameObjects.Graphics;
  holdHint: Phaser.GameObjects.Text;
  banner: Phaser.GameObjects.Text;
  bannerSub: Phaser.GameObjects.Text;
}

export const COLORS = {
  abyss: 0x050604,
  deep: 0x0b120e,
  waterTop: 0x164b3b,
  waterBottom: 0x07100c,
  foam: 0xc8b77f,
  net: 0xd6b86a,
  netActive: 0x4dad88,
  fish: 0xb87345,
  fishLight: 0xe0bd7d,
  danger: 0xb44758,
  ink: 0xf4eddf,
  dim: 0xaaa28f,
  glass: 0x0b0e0b,
};

const RARITY_COLORS: Record<string, number> = {
  common: 0xc5bdad,
  uncommon: 0x65aa88,
  rare: 0x8e789d,
  legendary: 0xd6b86a,
};

export const DISPLAY_FONT = '"Sora", "Avenir Next", sans-serif';
export const BODY_FONT = '"Commissioner", "Avenir Next", sans-serif';

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export function mix(a: number, b: number, t: number): number {
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

export class OceanDrawing {
  private readonly ambientObjects: Phaser.GameObjects.GameObject[] = [];
  private backdrop?: Phaser.GameObjects.Graphics;
  private rays?: Phaser.GameObjects.Graphics;
  private silhouettes?: Phaser.GameObjects.Graphics;
  private motesLayer?: Phaser.GameObjects.Graphics;
  private motes: Mote[] = [];
  private shoal: Silhouette[] = [];
  private fightView?: OceanFightView;
  private ringRadius = 21;

  constructor(private readonly scene: Phaser.Scene, private readonly track: TrackObject) {}

  getFightView(): OceanFightView | undefined {
    return this.fightView;
  }

  clearFightView(): void {
    this.fightView = undefined;
  }

  buildAmbient(): void {
    this.backdrop = this.scene.add.graphics().setDepth(0);
    this.rays = this.scene.add.graphics().setDepth(1);
    this.silhouettes = this.scene.add.graphics().setDepth(2);
    this.motesLayer = this.scene.add.graphics().setDepth(3);
    this.ambientObjects.push(this.backdrop, this.rays, this.silhouettes, this.motesLayer);
    this.shoal = [
      { x: this.scene.scale.width * 0.3, y: this.scene.scale.height * 0.34, speed: 11, scale: 1.15, direction: 1, phase: 0 },
      { x: this.scene.scale.width * 0.7, y: this.scene.scale.height * 0.58, speed: 8, scale: 0.85, direction: -1, phase: 2.1 },
      { x: this.scene.scale.width * 0.5, y: this.scene.scale.height * 0.78, speed: 14, scale: 0.65, direction: 1, phase: 4.4 },
    ];
    this.drawBackdrop();
    this.scatterMotes();
  }

  drawBackdrop(): void {
    if (!this.backdrop) return;
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    this.backdrop.clear();
    const bands = 26;
    const bandHeight = Math.ceil(height / bands);
    for (let index = 0; index < bands; index += 1) {
      const shade = mix(COLORS.waterTop, COLORS.waterBottom, index / (bands - 1));
      this.backdrop.fillStyle(shade, 1).fillRect(0, index * bandHeight, width, bandHeight + 1);
    }
    this.backdrop.fillStyle(COLORS.deep, 0.5).fillRect(0, height * 0.86, width, height * 0.14);
  }

  scatterMotes(): void {
    const target = Math.round(Math.min(34, Math.max(16, this.scene.scale.width / 14)));
    this.motes = Array.from({ length: target }, () => this.makeMote(true));
  }

  updateAmbient(now: number, dt: number): void {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
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

  createFightView(encounter: FishingEncounterResponse): OceanFightView {
    const dimmer = this.track(this.scene.add.rectangle(0, 0, 1, 1, COLORS.abyss, 0.34).setOrigin(0).setDepth(5));
    const lane = this.track(this.scene.add.graphics().setDepth(6));
    const fishShadowArt = this.track(this.scene.add.graphics().setDepth(7));
    const net = this.track(this.scene.add.graphics().setDepth(8));
    const fishTailArt = this.track(this.scene.add.graphics().setDepth(9));
    const fishBodyArt = this.track(this.scene.add.graphics().setDepth(10));
    const fightView: OceanFightView = {
      dimmer,
      lane,
      net,
      fishContainer: this.track(this.scene.add.container(0, 0, [fishTailArt, fishBodyArt]).setDepth(9)),
      fishBodyArt,
      fishTailArt,
      fishShadowArt,
      hudCard: this.track(this.scene.add.graphics().setDepth(12)),
      timerRing: this.track(this.scene.add.graphics().setDepth(13)),
      hudEyebrow: this.track(
        this.scene.add.text(0, 0, `${encounter.locationName.toUpperCase()} · FISH ON`, {
          fontFamily: BODY_FONT,
          fontSize: "10px",
          fontStyle: "bold",
          color: hex(COLORS.netActive),
          letterSpacing: 2,
        }).setDepth(13),
      ),
      hudSpecies: this.track(
        this.scene.add.text(0, 0, "", { fontFamily: DISPLAY_FONT, fontSize: "20px", fontStyle: "bold", color: "#fff4d6", stroke: "#04101c", strokeThickness: 3 }).setDepth(13),
      ),
      rarityPill: this.track(this.scene.add.graphics().setDepth(13)),
      rarityLabel: this.track(
        this.scene.add.text(0, 0, encounter.species.rarity.toUpperCase(), { fontFamily: BODY_FONT, fontSize: "9px", fontStyle: "bold", color: hex(RARITY_COLORS[encounter.species.rarity] ?? COLORS.dim), letterSpacing: 1.5 }).setDepth(14),
      ),
      timerText: this.track(this.scene.add.text(0, 0, "", { fontFamily: DISPLAY_FONT, fontSize: "13px", fontStyle: "bold", color: "#fff4d6" }).setOrigin(0.5).setDepth(14)),
      bottomCard: this.track(this.scene.add.graphics().setDepth(12)),
      meterTitle: this.track(
        this.scene.add.text(0, 0, "NET CONTROL", { fontFamily: BODY_FONT, fontSize: "10px", fontStyle: "bold", color: hex(COLORS.dim), letterSpacing: 2 }).setDepth(13),
      ),
      meterPercent: this.track(this.scene.add.text(0, 0, "", { fontFamily: DISPLAY_FONT, fontSize: "14px", fontStyle: "bold", color: "#fff4d6" }).setDepth(13)),
      meterTrack: this.track(this.scene.add.graphics().setDepth(13)),
      meterFill: this.track(this.scene.add.graphics().setDepth(14)),
      holdHint: this.track(
        this.scene.add.text(0, 0, "HOLD ANYWHERE TO LIFT · RELEASE TO DROP", { fontFamily: BODY_FONT, fontSize: "10px", fontStyle: "bold", color: hex(COLORS.foam), letterSpacing: 1.5 })
          .setOrigin(0.5)
          .setAlpha(0)
          .setDepth(13),
      ),
      banner: this.track(
        this.scene.add.text(0, 0, "", {
          fontFamily: DISPLAY_FONT,
          fontSize: `${Math.round(Math.min(46, this.scene.scale.width * 0.11))}px`,
          fontStyle: "bold",
          color: "#fff7dd",
          stroke: "#04101c",
          strokeThickness: 8,
          align: "center",
        }).setOrigin(0.5).setAlpha(0).setDepth(20),
      ),
      bannerSub: this.track(
        this.scene.add.text(0, 0, "", { fontFamily: BODY_FONT, fontSize: "14px", fontStyle: "bold", color: hex(COLORS.netActive), stroke: "#04101c", strokeThickness: 4, align: "center" })
          .setOrigin(0.5)
          .setAlpha(0)
          .setDepth(20),
      ),
    };
    this.fightView = fightView;
    return fightView;
  }

  resizeFight(layout: FightLayout, encounter: FishingEncounterResponse): void {
    const view = this.fightView;
    if (!view) return;
    view.dimmer.setSize(this.scene.scale.width, this.scene.scale.height).setPosition(0, 0);
    this.drawLane(view.lane, layout);
    this.layoutHud(view, layout, encounter);
    this.drawFishArt(view, layout);
  }

  renderFrame(
    layout: FightLayout,
    encounter: FishingEncounterResponse,
    state: FishingState,
    idleBob: boolean,
    insideStreak: number,
    controlLocked: boolean,
    onLowTimeWarning: () => void,
  ): void {
    const view = this.fightView;
    if (!view) return;
    const playfieldH = layout.trackBottom - layout.trackTop;
    const bob = idleBob ? Math.sin(state.elapsed * 2.4) * 4 : 0;
    const netY = layout.trackTop + playfieldH * state.netPosition;
    const fishY = layout.trackTop + playfieldH * state.fishPosition + bob;
    this.drawNet(view.net, layout, encounter, state.wasInside);
    const pulse = 1 + Math.min(insideStreak, 0.5) * 0.05;
    view.net.setPosition(layout.trackX, netY).setScale(pulse);
    view.fishContainer.setPosition(layout.trackX - netWidth(layout) * 0.12, fishY);
    view.fishContainer.setRotation(state.fishVelocity * 0.4);
    view.fishContainer.setScale(state.fishVelocity < 0 ? -1 : 1, 1);
    const tailWag = Math.sin(state.elapsed * (7 + encounter.species.movementProfile.speed * 6)) * 0.45;
    view.fishTailArt.setRotation(tailWag * (state.fishVelocity < 0 ? -1 : 1));
    view.fishShadowArt.setPosition(layout.trackX - netWidth(layout) * 0.12 + 6, fishY + 12);
    view.fishShadowArt.setScale(state.fishVelocity < 0 ? -1 : 1, 1);
    view.fishShadowArt.clear();
    view.fishShadowArt.fillStyle(0x01080e, 0.3).fillEllipse(0, 0, netWidth(layout) * 0.34, 9);
    this.renderTimer(view, encounter, state, controlLocked, onLowTimeWarning);
    this.renderMeter(view, layout, state);
  }

  private makeMote(anywhere: boolean): Mote {
    return {
      x: Math.random() * this.scene.scale.width,
      y: anywhere ? Math.random() * this.scene.scale.height : this.scene.scale.height + 12,
      radius: 0.8 + Math.random() * 2.1,
      speed: 7 + Math.random() * 16,
      alpha: 0.08 + Math.random() * 0.16,
      driftPhase: Math.random() * Math.PI * 2,
    };
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

  private drawLane(lane: Phaser.GameObjects.Graphics, layout: FightLayout): void {
    const { trackX, trackTop, trackBottom, trackW } = layout;
    const halfW = trackW / 2;
    lane.clear();
    lane.fillStyle(COLORS.foam, 0.028).fillRoundedRect(trackX - halfW, trackTop, trackW, trackBottom - trackTop, 22);
    lane.lineStyle(1, COLORS.foam, 0.16);
    for (let y = trackTop + 8; y < trackBottom - 4; y += 16) {
      lane.lineBetween(trackX - halfW, y, trackX - halfW, Math.min(y + 8, trackBottom));
      lane.lineBetween(trackX + halfW, y, trackX + halfW, Math.min(y + 8, trackBottom));
    }
    lane.lineStyle(1, COLORS.foam, 0.1);
    for (let step = 1; step < 10; step += 1) {
      const y = trackTop + ((trackBottom - trackTop) * step) / 10;
      lane.lineBetween(trackX - halfW - 7, y, trackX - halfW - 2, y);
      lane.lineBetween(trackX + halfW + 2, y, trackX + halfW + 7, y);
    }
    for (let wave = 0; wave < 3; wave += 1) {
      const y = trackTop - 10 + wave * 5;
      const spread = 26 - wave * 6;
      lane.lineStyle(2 - wave * 0.5, COLORS.foam, 0.22 - wave * 0.05);
      lane.beginPath();
      lane.moveTo(trackX - spread, y);
      lane.lineTo(trackX - spread * 0.3, y - 3);
      lane.lineTo(trackX + spread * 0.3, y);
      lane.lineTo(trackX + spread, y - 3);
      lane.strokePath();
    }
  }

  private layoutHud(view: OceanFightView, layout: FightLayout, encounter: FishingEncounterResponse): void {
    const { headerX, headerY, headerW, headerH, bottomX, bottomY, bottomW, bottomH } = layout;
    const radius = Math.min(18, headerH / 2);
    view.hudCard.clear();
    view.hudCard.fillStyle(COLORS.glass, 0.66).fillRoundedRect(headerX, headerY, headerW, headerH, radius);
    view.hudCard.lineStyle(1, COLORS.foam, 0.22).strokeRoundedRect(headerX, headerY, headerW, headerH, radius);
    view.hudCard.fillStyle(COLORS.glass, 0.66).fillRoundedRect(bottomX, bottomY, bottomW, bottomH, radius);
    view.hudCard.lineStyle(1, COLORS.foam, 0.22).strokeRoundedRect(bottomX, bottomY, bottomW, bottomH, radius);

    const padX = headerX + 16;
    const showHudEyebrow = headerH > 70;
    view.hudEyebrow.setVisible(showHudEyebrow);
    if (showHudEyebrow) view.hudEyebrow.setPosition(padX, headerY + 11);
    this.ringRadius = headerH > 70 ? 21 : 18;
    const ringX = headerX + headerW - this.ringRadius - 16;
    const ringY = headerY + headerH / 2;
    view.timerRing.setPosition(ringX, ringY);
    view.timerText.setPosition(ringX, ringY);
    const maxNameWidth = ringX - 14 - padX;
    const nameSize = Math.max(15, Math.min(headerH > 70 ? 20 : 17, Math.floor(maxNameWidth / Math.max(8, encounter.species.commonName.length) / 0.58)));
    view.hudSpecies.setFontSize(nameSize).setText(encounter.species.commonName).setPosition(padX, headerY + (showHudEyebrow ? 28 : 12));
    const rarityColor = RARITY_COLORS[encounter.species.rarity] ?? COLORS.dim;
    view.rarityLabel.setColor(hex(rarityColor));
    const pillHeight = 16;
    const pillWidth = view.rarityLabel.width + 16;
    const pillY = Math.min(view.hudSpecies.y + view.hudSpecies.height + 4, headerY + headerH - pillHeight - 7);
    view.rarityLabel.setPosition(padX + 2, pillY + (pillHeight - view.rarityLabel.height) / 2 - 1);
    view.rarityPill.clear();
    view.rarityPill.fillStyle(rarityColor, 0.14).fillRoundedRect(padX - 6, pillY, pillWidth, pillHeight, pillHeight / 2);
    view.rarityPill.lineStyle(1, rarityColor, 0.45).strokeRoundedRect(padX - 6, pillY, pillWidth, pillHeight, pillHeight / 2);

    const meterX = bottomX + 16;
    const meterW = bottomW - 32;
    const titleY = bottomY + 12;
    view.meterTitle.setPosition(meterX, titleY);
    view.meterPercent.setPosition(bottomX + bottomW - 16, titleY - 2).setOrigin(1, 0);
    const meterY = titleY + 20;
    view.meterTrack.clear();
    view.meterTrack.fillStyle(0x031017, 0.78).fillRoundedRect(meterX, meterY, meterW, 14, 7);
    view.meterTrack.lineStyle(1, COLORS.foam, 0.25).strokeRoundedRect(meterX, meterY, meterW, 14, 7);
    view.meterTrack.lineStyle(1, COLORS.foam, 0.2);
    for (const fraction of [0.25, 0.5, 0.75]) {
      const tickX = meterX + meterW * fraction;
      view.meterTrack.lineBetween(tickX, meterY + 2, tickX, meterY + 12);
    }
    view.holdHint.setPosition(this.scene.scale.width / 2, bottomY + bottomH - 18);
  }

  private drawFishArt(view: OceanFightView, layout: FightLayout): void {
    const width = netWidth(layout);
    const bodyLength = Phaser.Math.Clamp(width * 0.3, 32, 56);
    const bodyHeight = bodyLength * 0.48;
    view.fishBodyArt.clear();
    view.fishBodyArt.fillStyle(COLORS.fish, 1).fillTriangle(bodyLength * 0.28, 0, bodyLength * 0.52, -bodyHeight * 0.42, bodyLength * 0.52, bodyHeight * 0.42);
    view.fishBodyArt.fillEllipse(0, 0, bodyLength, bodyHeight);
    view.fishBodyArt.fillStyle(mix(COLORS.fish, COLORS.fishLight, 0.55), 0.85).fillTriangle(bodyLength * 0.02, -bodyHeight * 0.36, bodyLength * 0.16, -bodyHeight * 0.82, bodyLength * 0.24, -bodyHeight * 0.3);
    view.fishBodyArt.fillStyle(COLORS.fishLight, 0.7).fillEllipse(bodyLength * 0.06, -bodyHeight * 0.14, bodyLength * 0.44, bodyHeight * 0.3);
    view.fishBodyArt.fillStyle(0x102530, 1).fillCircle(bodyLength * 0.31, -bodyHeight * 0.14, Math.max(2, bodyLength * 0.05));
    view.fishBodyArt.lineStyle(2, 0xffe5b0, 0.6).strokeEllipse(0, 0, bodyLength, bodyHeight);
    view.fishTailArt.clear();
    view.fishTailArt.fillStyle(COLORS.fish, 1).fillTriangle(0, 0, -bodyLength * 0.34, -bodyHeight * 0.52, -bodyLength * 0.34, bodyHeight * 0.52);
    view.fishTailArt.fillStyle(COLORS.fishLight, 0.4).fillTriangle(0, 0, -bodyLength * 0.22, -bodyHeight * 0.3, -bodyLength * 0.22, bodyHeight * 0.3);
  }

  private drawNet(net: Phaser.GameObjects.Graphics, layout: FightLayout, encounter: FishingEncounterResponse, active: boolean): void {
    const playfieldH = layout.trackBottom - layout.trackTop;
    const width = netWidth(layout);
    const height = Math.max(30, playfieldH * encounter.miniGame.catchZoneSize);
    const color = active ? COLORS.netActive : COLORS.net;
    net.clear();
    net.fillStyle(color, active ? 0.2 : 0.09).fillEllipse(0, 0, width, height);
    net.lineStyle(active ? 4 : 3, color, active ? 1 : 0.85).strokeEllipse(0, 0, width, height);
    net.lineStyle(1, color, active ? 0.5 : 0.26);
    for (let x = -width * 0.32; x <= width * 0.32; x += width * 0.16) net.lineBetween(x, -height * 0.38, x, height * 0.38);
    for (let y = -height * 0.24; y <= height * 0.24; y += Math.max(9, height * 0.16)) net.lineBetween(-width * 0.43, y, width * 0.43, y);
    net.lineStyle(7, 0x8b6440, 1).lineBetween(width / 2 - 2, 0, width / 2 + 62, 24);
    net.lineStyle(2, 0xd7aa6d, 0.8).lineBetween(width / 2 + 1, -2, width / 2 + 62, 21);
    if (active) {
      net.lineStyle(2, color, 0.5).strokeEllipse(0, 0, width + 14, height + 12);
    }
  }

  private renderTimer(view: OceanFightView, encounter: FishingEncounterResponse, state: FishingState, controlLocked: boolean, onLowTimeWarning: () => void): void {
    const total = encounter.miniGame.durationSeconds;
    const remaining = Math.max(0, total - state.elapsed);
    const fraction = controlLocked ? 1 : remaining / total;
    view.timerRing.clear();
    view.timerRing.lineStyle(4, COLORS.foam, 0.14).strokeCircle(0, 0, this.ringRadius);
    const hue = fraction > 0.5 ? mix(COLORS.netActive, 0xffd166, (1 - fraction) * 2) : mix(0xffd166, COLORS.danger, (0.5 - fraction) * 2);
    if (fraction > 0.001) {
      view.timerRing.lineStyle(4, hue, 0.95);
      view.timerRing.beginPath();
      view.timerRing.arc(0, 0, this.ringRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction);
      view.timerRing.strokePath();
    }
    view.timerText.setText(`${remaining.toFixed(0)}`).setColor(fraction <= 0.25 && !controlLocked ? hex(COLORS.danger) : "#fff4d6");
    if (!controlLocked && remaining <= 3.05) onLowTimeWarning();
  }

  private renderMeter(view: OceanFightView, layout: FightLayout, state: FishingState): void {
    const meterX = layout.bottomX + 16;
    const meterW = layout.bottomW - 32;
    const meterY = view.meterTitle.y + 20;
    view.meterFill.clear();
    const progress = state.progress;
    const fillColor = progress < 0.2 ? COLORS.danger : progress > 0.72 ? COLORS.netActive : COLORS.net;
    view.meterFill.fillStyle(fillColor, 1).fillRoundedRect(meterX, meterY, Math.max(progress > 0 ? 10 : 0, meterW * progress), 14, 7);
    if (progress > 0.02) {
      view.meterFill.fillStyle(0xffffff, 0.4).fillCircle(meterX + Math.max(10, meterW * progress) - 7, meterY + 7, 2.4);
    }
    view.meterPercent.setText(`${Math.round(progress * 100)}%`).setColor(hex(fillColor));
  }
}
