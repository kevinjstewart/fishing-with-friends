import type { FishingEncounterResponse } from "@fishing/shared/contracts";
import Phaser from "phaser";
import { createFishingState, performanceFor, seededRandom, stepFishing, type FishingState } from "../fishing-mechanics";
import type { FishingCompleteEvent } from "../phaser-runtime";
import { computeFightLayout, type FightLayout, type SafeAreaInsets } from "./ocean-layout";
import { COLORS, OceanDrawing } from "./ocean-drawing";
import { OceanEffects } from "./ocean-effects";
import { createOceanInput } from "./ocean-input";

export class OceanScene extends Phaser.Scene {
  private safe: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  private mode: "ambient" | "fight" = "ambient";
  private readonly fightObjects: Phaser.GameObjects.GameObject[] = [];
  private readonly controls = createOceanInput();
  private readonly drawing: OceanDrawing;
  private readonly effects: OceanEffects;

  private encounter?: FishingEncounterResponse;
  private fishingState?: FishingState;
  private random = Math.random;
  private finished = false;
  private completedEmitted = false;
  private controlLocked = true;
  private insideStreak = 0;
  private lastProgress = 0;
  private warnedLowTime = false;
  private box: FightLayout = {
    headerX: 0,
    headerY: 0,
    headerW: 0,
    headerH: 0,
    bottomX: 0,
    bottomY: 0,
    bottomW: 0,
    bottomH: 0,
    trackX: 0,
    trackTop: 0,
    trackBottom: 0,
    trackW: 0,
  };

  constructor() {
    super("OceanScene");
    this.drawing = new OceanDrawing(this, this.track.bind(this));
    this.effects = new OceanEffects({
      scene: this,
      drawing: this.drawing,
      track: this.track.bind(this),
      getLayout: () => this.box,
      getEncounter: () => this.encounter,
      isFightMode: () => this.mode === "fight",
    });
  }

  create(): void {
    this.input.mouse?.disableContextMenu();
    this.game.events.on("fight:start", this.enterFightMode, this);
    this.game.events.on("safearea:changed", this.refreshSafeArea, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.controls.bind(this.input, this.input.keyboard);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeListeners, this);

    const stored = this.game.registry.get("safeArea") as SafeAreaInsets | undefined;
    if (stored) this.safe = stored;
    this.drawing.buildAmbient();
    this.enterAmbientMode();
  }

  update(time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 20);
    this.drawing.updateAmbient(time / 1000, dt);
    if (this.mode !== "fight" || !this.encounter || !this.fishingState || this.finished) return;
    if (this.controlLocked) {
      this.renderFrame(true);
      return;
    }
    const held = this.controls.isHeld();
    const step = stepFishing(this.fishingState, held, dt, this.encounter.miniGame, this.encounter.species.movementProfile, this.random);
    this.fishingState = step.state;
    this.fishingState.wasInside = !step.leftNet && (step.enteredNet || step.state.wasInside);
    this.insideStreak = this.fishingState.wasInside ? this.insideStreak + dt : 0;
    const midY = this.box.trackTop + (this.box.trackBottom - this.box.trackTop) / 2;
    if (step.enteredNet) {
      this.effects.spawnFloater("IN THE NET", COLORS.netActive, this.box.trackX, midY);
      navigator.vibrate?.(12);
    }
    if (step.leftNet) this.effects.spawnFloater("SLIPPING!", COLORS.danger, this.box.trackX, midY);
    this.checkProgressMilestones();
    this.renderFrame(false);
    if (step.state.result !== "playing") this.finishEncounter(step.state.result);
  }

  private removeListeners(): void {
    this.game.events.off("fight:start", this.enterFightMode, this);
    this.game.events.off("safearea:changed", this.refreshSafeArea, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.controls.unbind();
  }

  private refreshSafeArea(): void {
    const stored = this.game.registry.get("safeArea") as SafeAreaInsets | undefined;
    if (stored) this.safe = stored;
    this.handleResize();
  }

  private handleResize(): void {
    const stored = this.game.registry.get("safeArea") as SafeAreaInsets | undefined;
    if (stored) this.safe = stored;
    this.drawing.drawBackdrop();
    this.drawing.scatterMotes();
    if (this.mode !== "fight" || !this.encounter) return;
    this.box = computeFightLayout(this.scale.width, this.scale.height, this.safe);
    this.drawing.resizeFight(this.box, this.encounter);
    this.renderFrame(true);
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.fightObjects.push(object);
    return object;
  }

  private destroyFightObjects(): void {
    this.effects.clear();
    for (const object of this.fightObjects) object.destroy();
    this.fightObjects.length = 0;
    this.drawing.clearFightView();
  }

  private enterAmbientMode(): void {
    const encounterId = this.encounter?.encounterId;
    this.destroyFightObjects();
    this.mode = "ambient";
    this.encounter = undefined;
    this.fishingState = undefined;
    this.finished = false;
    this.completedEmitted = false;
    this.controlLocked = true;
    this.controls.reset();
    this.game.events.emit("fishing:ambient", encounterId);
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
    this.controls.reset();
    this.random = seededRandom(encounter.difficultySeed);
    this.fishingState = createFishingState(this.random);
    this.mode = "fight";

    this.drawing.createFightView(encounter);
    this.handleResize();
    this.effects.playIntroSequence(() => {
      this.controlLocked = false;
      this.effects.showHoldHintPulse();
    });
  }

  private renderFrame(idleBob: boolean): void {
    if (!this.fishingState || !this.encounter) return;
    this.drawing.renderFrame(this.box, this.encounter, this.fishingState, idleBob, this.insideStreak, this.controlLocked, () => this.warnLowTime());
  }

  private warnLowTime(): void {
    if (this.warnedLowTime) return;
    this.warnedLowTime = true;
    this.effects.warnLowTime();
  }

  private checkProgressMilestones(): void {
    if (!this.fishingState) return;
    const progress = this.fishingState.progress;
    if (this.lastProgress < 0.5 && progress >= 0.5) this.effects.spawnFloater("HALFWAY!", COLORS.net, this.box.trackX, this.box.trackTop + 34);
    if (this.lastProgress < 0.8 && progress >= 0.8) this.effects.spawnFloater("ALMOST!", COLORS.netActive, this.box.trackX, this.box.trackTop + 34);
    this.lastProgress = progress;
  }

  private finishEncounter(result: "caught" | "lost"): void {
    if (!this.activeEncounterReady()) return;
    this.finished = true;
    const state = this.fishingState;
    const encounter = this.encounter;
    if (!state || !encounter) return;
    const event: FishingCompleteEvent = { encounterId: encounter.encounterId, performance: performanceFor(state) };
    this.effects.finishEncounter(
      result,
      event,
      (completeEvent) => {
        if (this.completedEmitted) return;
        this.completedEmitted = true;
        this.game.events.emit("fishing:complete", completeEvent);
      },
      () => this.enterAmbientMode(),
      () => this.completedEmitted,
    );
  }

  private activeEncounterReady(): boolean {
    return Boolean(this.encounter && this.fishingState) && !this.finished && this.mode === "fight";
  }
}
