/**
 * 気筒数ごとのエンジン特性データ。
 * UI の説明表示やレッドライン目安に使用する。
 */
export interface EngineSpec {
  cylinders: number;
  /** 一般的なレイアウト表記 */
  layout: string;
  /** レッドライン目安 (RPM) */
  redline: number;
  /** アイドリング目安 (RPM) */
  idle: number;
  /** 代表的な点火順序の例 */
  firingOrder: string;
  /** 特徴の説明 */
  description: string;
  /** 代表的な搭載車・用途の例 */
  examples: string;
}

export const ENGINE_SPECS: Record<number, EngineSpec> = {
  3: {
    cylinders: 3,
    layout: '直列3気筒 (Inline-3)',
    redline: 6800,
    idle: 850,
    firingOrder: '1-3-2',
    description:
      '不等間隔気味の独特な鼓動とオフビートなサウンドが魅力。軽量コンパクトで燃費に優れる。',
    examples: 'トヨタ GR ヤリス / BMW i8 / フォード Fiesta EcoBoost',
  },
  4: {
    cylinders: 4,
    layout: '直列4気筒 (Inline-4)',
    redline: 7200,
    idle: 800,
    firingOrder: '1-3-4-2',
    description:
      '最も普及したレイアウト。バランスが良く、高回転までスムーズに吹け上がる。',
    examples: 'ホンダ シビック Type R / マツダ ロードスター / VW Golf GTI',
  },
  5: {
    cylinders: 5,
    layout: '直列5気筒 (Inline-5)',
    redline: 7000,
    idle: 820,
    firingOrder: '1-2-4-5-3',
    description:
      '4気筒と6気筒の中間。アウディが得意とする、ややワルな唸りのある独特なサウンド。',
    examples: 'アウディ RS3 / RS Q3 / 旧 ボルボ 850',
  },
  6: {
    cylinders: 6,
    layout: '直列6気筒 (Inline-6)',
    redline: 7600,
    idle: 750,
    firingOrder: '1-5-3-6-2-4',
    description:
      '完全バランスを実現する理想的レイアウト。滑らかでスムーズな「シルキーシックス」。',
    examples: 'BMW M3 (S58) / トヨタ スープラ (2JZ) / 日産 スカイライン (RB26)',
  },
  7: {
    cylinders: 7,
    layout: '直列7気筒 (Inline-7)',
    redline: 5200,
    idle: 600,
    firingOrder: '1-6-3-5-2-7-4',
    description:
      '主に大型船舶・産業用ディーゼルで採用される希少なレイアウト。低く重い鼓動。',
    examples: '大型舶用ディーゼル / 産業用発電機',
  },
  8: {
    cylinders: 8,
    layout: '直列8気筒 (Inline-8)',
    redline: 6000,
    idle: 700,
    firingOrder: '1-6-2-5-8-3-7-4',
    description:
      '戦前の高級車・レーシングカーで隆盛したクラシックなレイアウト。長く伸びやかな咆哮。',
    examples: 'ブガッティ Type 35 / アルファロメオ 8C / メルセデス W125',
  },
  9: {
    cylinders: 9,
    layout: '直列9気筒 (Inline-9)',
    redline: 4800,
    idle: 550,
    firingOrder: '1-7-4-8-2-6-3-9-5',
    description:
      '大型ディーゼル機関向けの多気筒構成。極めて重厚で地を這うようなサウンド。',
    examples: '舶用・定置型大型ディーゼル',
  },
  10: {
    cylinders: 10,
    layout: '直列10気筒 (Inline-10)',
    redline: 5600,
    idle: 650,
    firingOrder: '1-6-5-10-2-7-3-8-4-9',
    description:
      '実車では稀だが、滑らかさと迫力を兼ね備えた多気筒サウンドを楽しめる。',
    examples: 'コンセプト/シミュレーション用途',
  },
  11: {
    cylinders: 11,
    layout: '直列11気筒 (Inline-11)',
    redline: 4500,
    idle: 520,
    firingOrder: '1-7-3-9-5-11-2-8-4-10-6',
    description:
      '産業用大型機関に見られる構成。低回転で唸る巨大な鼓動が特徴。',
    examples: '大型産業用ディーゼル',
  },
  12: {
    cylinders: 12,
    layout: '直列12気筒 (Inline-12)',
    redline: 6200,
    idle: 600,
    firingOrder: '1-12-5-8-3-10-6-7-2-11-4-9',
    description:
      '究極の滑らかさと密度の高い咆哮。船舶・機関車用の巨大ユニットとして君臨する。',
    examples: '舶用・鉄道機関車用大型ディーゼル',
  },
};

export function getSpec(cylinders: number): EngineSpec {
  return ENGINE_SPECS[cylinders] ?? ENGINE_SPECS[4];
}
