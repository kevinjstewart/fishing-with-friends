import type Phaser from "phaser";

export interface OceanInputController {
  bind(input: Phaser.Input.InputPlugin, keyboard?: Phaser.Input.Keyboard.KeyboardPlugin | null): void;
  reset(): void;
  isHeld(): boolean;
  unbind(): void;
}

export function createOceanInput(): OceanInputController {
  const heldPointers = new Set<number>();
  let keyboardHeld = false;
  let boundInput: Phaser.Input.InputPlugin | undefined;
  let boundKeyboard: Phaser.Input.Keyboard.KeyboardPlugin | null | undefined;

  const pointerDown = (pointer: Phaser.Input.Pointer): void => {
    heldPointers.add(pointer.id);
  };
  const pointerUp = (pointer: Phaser.Input.Pointer): void => {
    heldPointers.delete(pointer.id);
  };
  const keyDown = (): void => {
    keyboardHeld = true;
  };
  const keyUp = (): void => {
    keyboardHeld = false;
  };

  const unbind = (): void => {
    boundInput?.off("pointerdown", pointerDown);
    boundInput?.off("pointerup", pointerUp);
    boundInput?.off("pointerupoutside", pointerUp);
    boundKeyboard?.off("keydown-SPACE", keyDown);
    boundKeyboard?.off("keyup-SPACE", keyUp);
    boundInput = undefined;
    boundKeyboard = undefined;
  };

  return {
    bind(input, keyboard) {
      unbind();
      boundInput = input;
      boundKeyboard = keyboard;
      boundInput.on("pointerdown", pointerDown);
      boundInput.on("pointerup", pointerUp);
      boundInput.on("pointerupoutside", pointerUp);
      boundKeyboard?.on("keydown-SPACE", keyDown);
      boundKeyboard?.on("keyup-SPACE", keyUp);
    },
    reset() {
      heldPointers.clear();
      keyboardHeld = false;
    },
    isHeld() {
      return heldPointers.size > 0 || keyboardHeld;
    },
    unbind,
  };
}
