import type React from "react";

export function ControlField(props: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label>
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

export function SliderControl(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  values?: number[];
  onChange: (value: number) => void;
}): React.ReactElement {
  const valueIndex = props.values?.indexOf(props.value) ?? -1;
  const min = props.values ? 0 : props.min;
  const max = props.values ? props.values.length - 1 : props.max;
  const value = props.values ? Math.max(0, valueIndex) : props.value;

  return (
    <label>
      <span>
        {props.label} <b>{props.value}</b>
      </span>
      <input
        type="range"
        min={String(min)}
        max={String(max)}
        step={String(props.step)}
        value={String(value)}
        onChange={(event) =>
          props.onChange(
            props.values?.[Number(event.currentTarget.value)] ??
              Number(event.currentTarget.value),
          )
        }
      />
    </label>
  );
}

export function DualRangeSlider(props: {
  label: string;
  min: number;
  max: number;
  step?: number;
  minValue: number;
  maxValue: number;
  formatValue?: (val: number) => string;
  onChange: (minValue: number, maxValue: number) => void;
}): React.ReactElement {
  const {
    label,
    min,
    max,
    step = 1,
    minValue,
    maxValue,
    formatValue = (val: number) => String(val),
    onChange,
  } = props;

  const effectiveMin = Math.min(min, max);
  const effectiveMax = Math.max(min, max);
  const clampedMin = Math.max(effectiveMin, Math.min(effectiveMax, minValue));
  const clampedMax = Math.max(clampedMin, Math.min(effectiveMax, maxValue));

  const totalRange = effectiveMax - effectiveMin || 1;
  const leftPercent = ((clampedMin - effectiveMin) / totalRange) * 100;
  const rightPercent = ((clampedMax - effectiveMin) / totalRange) * 100;

  return (
    <div className="dual-range-container">
      <div className="dual-range-header">
        <span>{label}</span>
        <b>
          {formatValue(clampedMin)} – {formatValue(clampedMax)}
        </b>
      </div>
      <div className="dual-range-track-wrapper">
        <div className="dual-range-track-bg" />
        <div
          className="dual-range-track-active"
          style={{
            left: `${leftPercent}%`,
            width: `${Math.max(0, rightPercent - leftPercent)}%`,
          }}
        />
        <input
          type="range"
          aria-label={`${label} minimum`}
          min={effectiveMin}
          max={effectiveMax}
          step={step}
          value={clampedMin}
          className="dual-range-input dual-range-min"
          style={{
            zIndex: clampedMin > effectiveMax - totalRange * 0.15 ? 5 : 3,
          }}
          onChange={(event) => {
            const nextMin = Number(event.currentTarget.value);
            onChange(Math.min(nextMin, clampedMax), clampedMax);
          }}
        />
        <input
          type="range"
          aria-label={`${label} maximum`}
          min={effectiveMin}
          max={effectiveMax}
          step={step}
          value={clampedMax}
          className="dual-range-input dual-range-max"
          style={{ zIndex: 4 }}
          onChange={(event) => {
            const nextMax = Number(event.currentTarget.value);
            onChange(clampedMin, Math.max(nextMax, clampedMin));
          }}
        />
      </div>
    </div>
  );
}
