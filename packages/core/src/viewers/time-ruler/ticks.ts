export type TimeFormatMode =
  | "auto"
  | "seconds"
  | "timecode"
  | "hhmmss"
  | ((sec: number) => string);

const STANDARD_STEPS = [
  0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2,
  0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400,
  28800, 86400,
];

export type TimeTicksResult = {
  majorStep: number;
  minorStep: number;
  majorTicks: number[];
  minorTicks: number[];
};

export function computeTimeTicks(
  startTime: number,
  endTime: number,
  pixelWidth: number,
  minMajorPixelSpacing = 75,
): TimeTicksResult {
  const duration = Math.max(0.000001, endTime - startTime);
  const width = Math.max(1, pixelWidth);
  const targetMajorCount = Math.max(1, Math.floor(width / minMajorPixelSpacing));
  const rawStep = duration / targetMajorCount;

  let majorStep = STANDARD_STEPS[STANDARD_STEPS.length - 1]!;
  for (const candidate of STANDARD_STEPS) {
    if (candidate >= rawStep) {
      majorStep = candidate;
      break;
    }
  }

  // Choose appropriate minor subdivisions
  let minorStep: number;
  if (majorStep <= 0.0005) {
    minorStep = majorStep / 5;
  } else if (majorStep === 60 || majorStep === 120 || majorStep === 300) {
    minorStep = majorStep / 5;
  } else if (majorStep === 1800 || majorStep === 3600) {
    minorStep = majorStep / 6;
  } else {
    // Standard 1-2-5 ladder
    const magnitude = 10 ** Math.floor(Math.log10(majorStep));
    const normalized = majorStep / magnitude;
    if (Math.abs(normalized - 1) < 0.1) {
      minorStep = majorStep / 5;
    } else if (Math.abs(normalized - 2) < 0.1) {
      minorStep = majorStep / 4;
    } else if (Math.abs(normalized - 5) < 0.1) {
      minorStep = majorStep / 5;
    } else {
      minorStep = majorStep / 5;
    }
  }

  const majorTicks: number[] = [];
  const minorTicks: number[] = [];

  const startMajor = Math.floor((startTime - 1e-9) / majorStep) * majorStep;
  const endMajor = Math.ceil((endTime + 1e-9) / majorStep) * majorStep;

  for (
    let t = startMajor;
    t <= endMajor + 1e-9;
    t = Math.round((t + majorStep) / majorStep) * majorStep
  ) {
    const cleanT = cleanFloat(t);
    if (cleanT >= startTime - 1e-9 && cleanT <= endTime + 1e-9) {
      majorTicks.push(cleanT);
    }
  }

  const startMinor = Math.floor((startTime - 1e-9) / minorStep) * minorStep;
  const endMinor = Math.ceil((endTime + 1e-9) / minorStep) * minorStep;

  for (
    let t = startMinor;
    t <= endMinor + 1e-9;
    t = Math.round((t + minorStep) / minorStep) * minorStep
  ) {
    const cleanT = cleanFloat(t);
    if (cleanT >= startTime - 1e-9 && cleanT <= endTime + 1e-9) {
      minorTicks.push(cleanT);
    }
  }

  return {
    majorStep,
    minorStep,
    majorTicks,
    minorTicks,
  };
}

function cleanFloat(value: number): number {
  return Number.parseFloat(value.toFixed(10));
}

export function formatTimeLabel(
  seconds: number,
  step: number,
  format: TimeFormatMode = "auto",
): string {
  if (typeof format === "function") {
    return format(seconds);
  }

  const isNegative = seconds < 0;
  const absSec = Math.abs(seconds);

  if (format === "seconds") {
    const decimals = step < 1 ? Math.min(4, Math.max(0, Math.ceil(-Math.log10(step)))) : 0;
    return `${isNegative ? "-" : ""}${absSec.toFixed(decimals)}s`;
  }

  if (format === "timecode" || format === "hhmmss") {
    const h = Math.floor(absSec / 3600);
    const m = Math.floor((absSec % 3600) / 60);
    const s = Math.floor(absSec % 60);
    const ms = Math.floor((absSec % 1) * 1000);

    const pad = (n: number, z = 2) => String(n).padStart(z, "0");

    if (step < 1) {
      return `${isNegative ? "-" : ""}${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
    }
    return `${isNegative ? "-" : ""}${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  // "auto" formatting:
  if (absSec < 1) {
    const decimals = step < 1 ? Math.min(4, Math.max(1, Math.ceil(-Math.log10(step)))) : 2;
    return `${isNegative ? "-" : ""}${absSec.toFixed(decimals)}s`;
  }

  if (absSec < 60) {
    const decimals = step < 1 ? Math.min(3, Math.max(0, Math.ceil(-Math.log10(step)))) : 0;
    return `${isNegative ? "-" : ""}${absSec.toFixed(decimals)}s`;
  }

  if (absSec < 3600) {
    const m = Math.floor(absSec / 60);
    const s = Math.floor(absSec % 60);
    const pad = (n: number) => String(n).padStart(2, "0");
    if (step < 1) {
      const frac = (absSec % 1).toFixed(Math.min(3, Math.ceil(-Math.log10(step)))).slice(1);
      return `${isNegative ? "-" : ""}${m}:${pad(s)}${frac}`;
    }
    return `${isNegative ? "-" : ""}${m}:${pad(s)}`;
  }

  const h = Math.floor(absSec / 3600);
  const m = Math.floor((absSec % 3600) / 60);
  const s = Math.floor(absSec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${isNegative ? "-" : ""}${h}:${pad(m)}:${pad(s)}`;
}
