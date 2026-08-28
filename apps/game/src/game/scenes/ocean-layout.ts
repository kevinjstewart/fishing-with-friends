export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FightLayout {
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

export function computeFightLayout(width: number, height: number, safe: SafeAreaInsets): FightLayout {
  const compact = height < 560;
  const sideInset = (side: "left" | "right") => Math.max(12, safe[side] + 12);
  const left = sideInset("left");
  const right = sideInset("right");
  const top = safe.top + (compact ? 8 : 12);
  const headerH = compact ? 66 : 76;
  const bottomH = compact ? 96 : 114;
  return {
    headerX: left,
    headerY: top,
    headerW: width - left - right,
    headerH,
    bottomX: left,
    bottomY: height - safe.bottom - (compact ? 8 : 10) - bottomH,
    bottomW: width - left - right,
    bottomH,
    trackX: width / 2,
    trackTop: top + headerH + (compact ? 10 : 18),
    trackBottom: height - safe.bottom - (compact ? 8 : 10) - bottomH - (compact ? 10 : 18),
    trackW: Math.min(Math.max(width * 0.6, 210), 340),
  };
}

export function netWidth(layout: FightLayout): number {
  return Math.min(196, Math.max(116, layout.trackW * 0.6));
}
