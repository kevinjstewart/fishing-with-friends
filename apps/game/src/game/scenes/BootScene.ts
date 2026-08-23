import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload(): void {
    // Future static assets should be registered here or in a dedicated loader module.
    this.load.setPath("/assets");
  }

  create(): void {
    this.scene.start("OceanScene");
  }
}
