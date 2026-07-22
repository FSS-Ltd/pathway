export type SceneSlot = {
  left: `${number}%`;
  top: `${number}%`;
  width: `${number}%`;
};

const LARGE_SLOTS: Readonly<Record<1 | 2 | 3, readonly SceneSlot[]>> = {
  1: [{ left: "27%", top: "16%", width: "46%" }],
  2: [
    { left: "8%", top: "19%", width: "38%" },
    { left: "54%", top: "19%", width: "38%" },
  ],
  3: [
    { left: "4%", top: "25%", width: "30%" },
    { left: "35%", top: "25%", width: "30%" },
    { left: "66%", top: "25%", width: "30%" },
  ],
};

const COMPACT_ROW_SLOTS: Readonly<Record<4 | 5 | 6, readonly SceneSlot[]>> = {
  4: [
    { left: "12%", top: "25%", width: "16%" },
    { left: "32%", top: "25%", width: "16%" },
    { left: "52%", top: "25%", width: "16%" },
    { left: "72%", top: "25%", width: "16%" },
  ],
  5: [
    { left: "5%", top: "25%", width: "16%" },
    { left: "24%", top: "25%", width: "16%" },
    { left: "43%", top: "25%", width: "16%" },
    { left: "62%", top: "25%", width: "16%" },
    { left: "81%", top: "25%", width: "16%" },
  ],
  6: [
    { left: "2%", top: "25%", width: "16%" },
    { left: "18%", top: "25%", width: "16%" },
    { left: "34%", top: "25%", width: "16%" },
    { left: "50%", top: "25%", width: "16%" },
    { left: "66%", top: "25%", width: "16%" },
    { left: "82%", top: "25%", width: "16%" },
  ],
};

const STAGGERED_SLOTS: Readonly<Record<7 | 8 | 9 | 10, readonly SceneSlot[]>> =
  {
    7: [
      { left: "7%", top: "12%", width: "20%" },
      { left: "29%", top: "12%", width: "20%" },
      { left: "51%", top: "12%", width: "20%" },
      { left: "73%", top: "12%", width: "20%" },
      { left: "19%", top: "56%", width: "20%" },
      { left: "41%", top: "56%", width: "20%" },
      { left: "63%", top: "56%", width: "20%" },
    ],
    8: [
      { left: "7%", top: "12%", width: "20%" },
      { left: "29%", top: "12%", width: "20%" },
      { left: "51%", top: "12%", width: "20%" },
      { left: "73%", top: "12%", width: "20%" },
      { left: "7%", top: "56%", width: "20%" },
      { left: "29%", top: "56%", width: "20%" },
      { left: "51%", top: "56%", width: "20%" },
      { left: "73%", top: "56%", width: "20%" },
    ],
    9: [
      { left: "2%", top: "12%", width: "16%" },
      { left: "22%", top: "12%", width: "16%" },
      { left: "42%", top: "12%", width: "16%" },
      { left: "62%", top: "12%", width: "16%" },
      { left: "82%", top: "12%", width: "16%" },
      { left: "12%", top: "56%", width: "16%" },
      { left: "32%", top: "56%", width: "16%" },
      { left: "52%", top: "56%", width: "16%" },
      { left: "72%", top: "56%", width: "16%" },
    ],
    10: [
      { left: "2%", top: "12%", width: "16%" },
      { left: "22%", top: "12%", width: "16%" },
      { left: "42%", top: "12%", width: "16%" },
      { left: "62%", top: "12%", width: "16%" },
      { left: "82%", top: "12%", width: "16%" },
      { left: "2%", top: "56%", width: "16%" },
      { left: "22%", top: "56%", width: "16%" },
      { left: "42%", top: "56%", width: "16%" },
      { left: "62%", top: "56%", width: "16%" },
      { left: "82%", top: "56%", width: "16%" },
    ],
  };

export function sceneSlots(count: number): readonly SceneSlot[] {
  if (!Number.isInteger(count) || count < 0 || count > 10) {
    throw new RangeError(
      "Scene object count must be an integer between 0 and 10.",
    );
  }

  if (count === 0) return [];
  if (count <= 3) return LARGE_SLOTS[count as 1 | 2 | 3];
  if (count <= 6) return COMPACT_ROW_SLOTS[count as 4 | 5 | 6];
  return STAGGERED_SLOTS[count as 7 | 8 | 9 | 10];
}
