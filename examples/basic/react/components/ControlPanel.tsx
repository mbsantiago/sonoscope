import type {
  BuiltInColorMap,
  FrequencyScale,
  ValueMode,
  WindowName,
} from "@sonogram/core";
import type React from "react";
import { RECORDINGS } from "../recordings";
import type { ShaderProgram, SpectrogramSettings } from "../types";
import { ControlField, SliderControl } from "./ControlField";

export type ControlPanelProps = {
  settings: SpectrogramSettings;
  maxFrequency: number;
  onUpdateSettings: (update: Partial<SpectrogramSettings>) => void;
  onUpdateMaxFrequency: (maxFrequency: number) => void;
  onResetView: () => void;
};

export function ControlPanel(props: ControlPanelProps): React.ReactElement {
  const {
    settings,
    maxFrequency,
    onUpdateSettings,
    onUpdateMaxFrequency,
    onResetView,
  } = props;

  return (
    <aside className="controls">
      <ControlField label="Recording">
        <select
          value={settings.recordingIndex}
          onChange={(event) =>
            onUpdateSettings({
              recordingIndex: Number(event.currentTarget.value),
            })
          }
        >
          {RECORDINGS.map((recording, index) => (
            <option key={recording.url} value={index}>
              {recording.title}
            </option>
          ))}
        </select>
      </ControlField>

      <div className="control-grid">
        <ControlField label="Frequency">
          <select
            value={settings.frequencyScale}
            onChange={(event) =>
              onUpdateSettings({
                frequencyScale: event.currentTarget.value as FrequencyScale,
              })
            }
          >
            <option value="linear">linear</option>
            <option value="log">log</option>
            <option value="mel">mel</option>
          </select>
        </ControlField>

        <ControlField label="Color">
          <select
            value={settings.colorMap}
            onChange={(event) =>
              onUpdateSettings({
                colorMap: event.currentTarget.value as BuiltInColorMap,
              })
            }
          >
            <option value="magma">magma</option>
            <option value="viridis">viridis</option>
            <option value="plasma">plasma</option>
            <option value="inferno">inferno</option>
            <option value="cividis">cividis</option>
            <option value="turbo">turbo</option>
            <option value="jet">jet</option>
            <option value="gray">gray</option>
            <option value="tab20">tab20</option>
          </select>
        </ControlField>

        <ControlField label="Value">
          <select
            value={settings.valueMode}
            onChange={(event) =>
              onUpdateSettings({
                valueMode: event.currentTarget.value as ValueMode,
              })
            }
          >
            <option value="db">db</option>
            <option value="magnitude">magnitude</option>
            <option value="power">power</option>
          </select>
        </ControlField>

        <ControlField label="Window">
          <select
            value={settings.window}
            onChange={(event) =>
              onUpdateSettings({
                window: event.currentTarget.value as WindowName,
              })
            }
          >
            <option value="hann">hann</option>
            <option value="hamming">hamming</option>
            <option value="blackman">blackman</option>
            <option value="rectangular">rectangular</option>
          </select>
        </ControlField>
      </div>

      <SliderControl
        label="Min dB"
        value={settings.minDb}
        min={-140}
        max={-20}
        step={1}
        onChange={(minDb) => onUpdateSettings({ minDb })}
      />

      <SliderControl
        label="Max dB"
        value={settings.maxDb}
        min={-60}
        max={12}
        step={1}
        onChange={(maxDb) => onUpdateSettings({ maxDb })}
      />

      <SliderControl
        label="Window size"
        value={settings.windowSize}
        min={256}
        max={2048}
        step={1}
        values={[256, 512, 1024, 2048]}
        onChange={(windowSize) =>
          onUpdateSettings({
            windowSize,
            hopSize: Math.min(settings.hopSize, windowSize / 2),
          })
        }
      />

      <SliderControl
        label="Hop size"
        value={settings.hopSize}
        min={32}
        max={512}
        step={32}
        onChange={(hopSize) => onUpdateSettings({ hopSize })}
      />

      <SliderControl
        label="Max frequency"
        value={maxFrequency}
        min={1000}
        max={24_000}
        step={500}
        onChange={(maxFreq) => onUpdateMaxFrequency(maxFreq)}
      />

      <ControlField label="Shader">
        <select
          value={settings.shaderProgram}
          onChange={(event) =>
            onUpdateSettings({
              shaderProgram: event.currentTarget.value as ShaderProgram,
            })
          }
        >
          <option value="auto">auto</option>
          <option value="normal">normal</option>
          <option value="dither">dither</option>
          <option value="sobel">sobel</option>
          <option value="terrain">terrain</option>
        </select>
      </ControlField>

      <button type="button" onClick={onResetView}>
        Reset view
      </button>
    </aside>
  );
}
