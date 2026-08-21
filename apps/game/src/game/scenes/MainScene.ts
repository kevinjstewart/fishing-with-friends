import Phaser from "phaser";

export class MainScene extends Phaser.Scene {
  private title?: Phaser.GameObjects.Text;
  private subtitle?: Phaser.GameObjects.Text;

  constructor() {
    super("MainScene");
  }

  create(): void {
    this.title = this.add.text(0, 0, "Fishing with Friends", {
      color: "#f6fbff",
      fontFamily: "system-ui, sans-serif",
      fontSize: "28px",
      fontStyle: "bold",
    });
    this.subtitle = this.add.text(0, 0, "Game foundation ready", {
      color: "#a8c2d9",
      fontFamily: "system-ui, sans-serif",
      fontSize: "16px",
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.layout({ width: this.scale.width, height: this.scale.height });
  }

  private layout(size: { width: number; height: number }): void {
    this.title?.setPosition(size.width / 2, size.height / 2 - 18).setOrigin(0.5);
    this.subtitle?.setPosition(size.width / 2, size.height / 2 + 24).setOrigin(0.5);
  }
}
