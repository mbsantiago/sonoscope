import type {
  SpectrogramMatrix,
  SpectrogramTransform,
  TransformContext,
} from "./types";

export function getTransformPadding(transforms: SpectrogramTransform[]): {
  timePaddingSeconds: number;
  frequencyPaddingBins: number;
} {
  return transforms.reduce(
    (padding, transform) => ({
      timePaddingSeconds: Math.max(
        padding.timePaddingSeconds,
        transform.timePaddingSeconds ?? 0,
      ),
      frequencyPaddingBins: Math.max(
        padding.frequencyPaddingBins,
        transform.frequencyPaddingBins ?? 0,
      ),
    }),
    { timePaddingSeconds: 0, frequencyPaddingBins: 0 },
  );
}

export async function applyTransforms(
  matrix: SpectrogramMatrix,
  transforms: SpectrogramTransform[],
  context: TransformContext,
): Promise<SpectrogramMatrix> {
  let current = matrix;
  for (const transform of transforms)
    current = await transform.apply(current, context);
  return current;
}
