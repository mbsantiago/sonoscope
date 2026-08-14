export type RecordingItem = {
  readonly url: string;
  readonly title: string;
  readonly description?: string;
};

export const RECORDINGS: readonly RecordingItem[] = [
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/0/01/After_You%27ve_Gone_%28Harris_1918_recording%29.wav?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original",
    title: "After You’ve Gone (Harris 1918 recording).wav",
    description: "Wikimedia Commons · Range-enabled WAV",
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/2/25/Same.wav",
    title: "Same.wav",
    description: "Range-enabled WAV from Wikimedia Commons",
  },
  {
    url: "https://xeno-canto.org/944837/download",
    title: "Western Barbastelle",
    description: "XC944837 · Xeno-Canto",
  },
  {
    url: "https://xeno-canto.org/380406/download",
    title: "Night Parrot",
    description: "XC380406 · Xeno-Canto",
  },
] as const;
