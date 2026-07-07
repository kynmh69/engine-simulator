/**
 * 6速シーケンシャルギアボックスの計算ヘルパー。
 * gear は 0 = ニュートラル、1〜6 = 各ギア。
 */

/** 各ギアの変速比（1速〜6速） */
export const GEARS = [3.6, 2.19, 1.61, 1.28, 1.0, 0.82];

/** 最終減速比 */
export const FINAL_DRIVE = 4.1;

/** タイヤ外周 (m) */
export const TIRE_CIRC_M = 1.95;

export const MAX_GEAR = GEARS.length;

/** ギア表示ラベル（N / 1〜6） */
export function gearLabel(gear: number): string {
  return gear === 0 ? 'N' : String(gear);
}

/** 現在の回転数とギアから車速 (km/h) を求める。ニュートラルは 0。 */
export function speedKmh(rpm: number, gear: number): number {
  if (gear <= 0 || gear > MAX_GEAR) return 0;
  const wheelRpm = rpm / (GEARS[gear - 1] * FINAL_DRIVE);
  return (wheelRpm * TIRE_CIRC_M * 60) / 1000;
}

/**
 * 車速維持のままシフトした場合の変速後回転数。
 * ニュートラルを挟む場合は回転数を維持する。
 */
export function rpmAfterShift(rpm: number, fromGear: number, toGear: number): number {
  if (fromGear <= 0 || toGear <= 0) return rpm;
  return (rpm * GEARS[toGear - 1]) / GEARS[fromGear - 1];
}
