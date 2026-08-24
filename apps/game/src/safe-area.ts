export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function readInset(element: CSSStyleDeclaration, property: string): number {
  return Number.parseFloat(element.getPropertyValue(property)) || 0;
}

export function readSafeArea(element: Element): SafeAreaInsets {
  const style = getComputedStyle(element);
  return {
    top: readInset(style, "padding-top"),
    right: readInset(style, "padding-right"),
    bottom: readInset(style, "padding-bottom"),
    left: readInset(style, "padding-left"),
  };
}

export function publishSafeArea(
  target: HTMLElement,
  insets: Partial<Record<"device" | "content", SafeAreaInsets>>,
): void {
  const device = { top: 0, right: 0, bottom: 0, left: 0, ...insets.device };
  const content = { top: 0, right: 0, bottom: 0, left: 0, ...insets.content };

  target.style.setProperty("--tg-safe-area-inset-top", `${device.top}px`);
  target.style.setProperty("--tg-safe-area-inset-right", `${device.right}px`);
  target.style.setProperty("--tg-safe-area-inset-bottom", `${device.bottom}px`);
  target.style.setProperty("--tg-safe-area-inset-left", `${device.left}px`);

  target.style.setProperty("--tg-content-safe-area-inset-top", `${content.top}px`);
  target.style.setProperty("--tg-content-safe-area-inset-right", `${content.right}px`);
  target.style.setProperty("--tg-content-safe-area-inset-bottom", `${content.bottom}px`);
  target.style.setProperty("--tg-content-safe-area-inset-left", `${content.left}px`);
}
