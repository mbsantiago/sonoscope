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
