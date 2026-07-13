/**
 * Specifications for each inline engine layout (3 through 12 cylinders).
 * These drive both the audio model and the on-screen visualisation.
 */
export interface EngineSpec {
  cylinders: number;
  label: string;
  idleRpm: number;
  redlineRpm: number;
  /** Relative rotational inertia — bigger engines rev up more slowly. */
  inertia: number;
  description: string;
}

export const ENGINE_SPECS: Record<number, EngineSpec> = {
  3: {
    cylinders: 3,
    label: '直列3気筒 (I3)',
    idleRpm: 850,
    redlineRpm: 7000,
    inertia: 0.8,
    description: '軽快で歯切れのよい三拍子。軽自動車やコンパクトカー向け。',
  },
  4: {
    cylinders: 4,
    label: '直列4気筒 (I4)',
    idleRpm: 800,
    redlineRpm: 7500,
    inertia: 1.0,
    description: '最も一般的なレイアウト。バランスと効率に優れる。',
  },
  5: {
    cylinders: 5,
    label: '直列5気筒 (I5)',
    idleRpm: 800,
    redlineRpm: 7000,
    inertia: 1.15,
    description: '独特の五気筒サウンド。ラリーカーで有名な唸り。',
  },
  6: {
    cylinders: 6,
    label: '直列6気筒 (I6)',
    idleRpm: 750,
    redlineRpm: 7200,
    inertia: 1.3,
    description: '完全バランスの滑らかな回転。シルキーシックス。',
  },
  7: {
    cylinders: 7,
    label: '直列7気筒 (I7)',
    idleRpm: 720,
    redlineRpm: 6500,
    inertia: 1.5,
    description: '大型ディーゼルに見られる稀少な奇数レイアウト。',
  },
  8: {
    cylinders: 8,
    label: '直列8気筒 (I8)',
    idleRpm: 700,
    redlineRpm: 6000,
    inertia: 1.7,
    description: '往年の高級車を彩ったロングストレート8の重厚な音。',
  },
  9: {
    cylinders: 9,
    label: '直列9気筒 (I9)',
    idleRpm: 680,
    redlineRpm: 5500,
    inertia: 1.9,
    description: '船舶・産業用に近い密度の高い排気音。',
  },
  10: {
    cylinders: 10,
    label: '直列10気筒 (I10)',
    idleRpm: 650,
    redlineRpm: 5200,
    inertia: 2.1,
    description: '極めて滑らかで力強いトルク感。',
  },
  11: {
    cylinders: 11,
    label: '直列11気筒 (I11)',
    idleRpm: 620,
    redlineRpm: 5000,
    inertia: 2.3,
    description: '大型舶用機関を思わせる連続的な咆哮。',
  },
  12: {
    cylinders: 12,
    label: '直列12気筒 (I12)',
    idleRpm: 600,
    redlineRpm: 4800,
    inertia: 2.6,
    description: '重厚長大。地を這うような連続排気音。',
  },
};

export const MIN_CYLINDERS = 3;
export const MAX_CYLINDERS = 12;

/**
 * A textbook even-firing order for the given cylinder count.
 * Used purely for the firing-order visualisation.
 */
export function firingOrder(cylinders: number): number[] {
  const known: Record<number, number[]> = {
    3: [1, 2, 3],
    4: [1, 3, 4, 2],
    5: [1, 2, 4, 5, 3],
    6: [1, 5, 3, 6, 2, 4],
    7: [1, 3, 5, 7, 2, 4, 6],
    8: [1, 6, 2, 5, 8, 3, 7, 4],
    9: [1, 2, 4, 6, 8, 9, 7, 5, 3],
    10: [1, 6, 5, 10, 2, 7, 3, 8, 4, 9],
    11: [1, 3, 5, 7, 9, 11, 2, 4, 6, 8, 10],
    12: [1, 7, 5, 11, 3, 9, 6, 12, 2, 8, 4, 10],
  };
  return known[cylinders] ?? Array.from({ length: cylinders }, (_, i) => i + 1);
}
