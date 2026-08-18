import {
  FrequencyRuler,
  SonoscopeProvider,
  Spectrogram,
  TimeRuler,
  Waveform,
} from "@sonoscope/react";
import { useEffect, useRef, useState } from "react";

export const DEFAULT_AUDIO_URL =
  "https://upload.wikimedia.org/wikipedia/commons/c/c5/Marico_Sunbird_%28Nectarinia_mariquensis%29_%28W1CDR0000941_BD17%29.ogg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original";

export default function ReactDemo() {
  const [cmap, setCmap] = useState<any>("plasma");
  const [scale, setScale] = useState<any>("mel");
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  return (
    <div
      className="not-content"
      style={{
        border: "1px solid rgba(128, 128, 128, 0.25)",
        borderRadius: "8px",
        padding: "16px",
        background: "rgba(0, 0, 0, 0.03)",
        margin: "0.75rem 0 2rem 0",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          marginBottom: "20px",
          fontSize: "13px",
          lineHeight: 1,
          margin: "0 0 20px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            alignItems: "center",
            margin: 0,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              margin: 0,
            }}
          >
            <span style={{ fontWeight: 500, opacity: 0.85, fontSize: "12px" }}>
              Colormap:
            </span>
            <select
              value={cmap}
              onChange={(e) => setCmap(e.target.value)}
              style={{
                height: "28px",
                padding: "2px 24px 2px 8px",
                borderRadius: "4px",
                border: "1px solid rgba(128, 128, 128, 0.3)",
                background: "rgba(128, 128, 128, 0.08)",
                color: "inherit",
                fontSize: "12px",
                fontWeight: 500,
                outline: "none",
                cursor: "pointer",
                appearance: "none",
                WebkitAppearance: "none",
                backgroundImage:
                  "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 6px center",
                backgroundSize: "12px",
              }}
            >
              <option value="plasma" style={{ background: "#18181b", color: "#fff" }}>
                Plasma
              </option>
              <option value="viridis" style={{ background: "#18181b", color: "#fff" }}>
                Viridis
              </option>
              <option value="inferno" style={{ background: "#18181b", color: "#fff" }}>
                Inferno
              </option>
              <option value="magma" style={{ background: "#18181b", color: "#fff" }}>
                Magma
              </option>
              <option value="turbo" style={{ background: "#18181b", color: "#fff" }}>
                Turbo
              </option>
              <option value="cividis" style={{ background: "#18181b", color: "#fff" }}>
                Cividis
              </option>
              <option value="gray" style={{ background: "#18181b", color: "#fff" }}>
                Gray
              </option>
            </select>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              margin: 0,
            }}
          >
            <span style={{ fontWeight: 500, opacity: 0.85, fontSize: "12px" }}>
              Scale:
            </span>
            <select
              value={scale}
              onChange={(e) => setScale(e.target.value)}
              style={{
                height: "28px",
                padding: "2px 24px 2px 8px",
                borderRadius: "4px",
                border: "1px solid rgba(128, 128, 128, 0.3)",
                background: "rgba(128, 128, 128, 0.08)",
                color: "inherit",
                fontSize: "12px",
                fontWeight: 500,
                outline: "none",
                cursor: "pointer",
                appearance: "none",
                WebkitAppearance: "none",
                backgroundImage:
                  "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 6px center",
                backgroundSize: "12px",
              }}
            >
              <option value="mel" style={{ background: "#18181b", color: "#fff" }}>
                Mel (Perceptual)
              </option>
              <option value="log" style={{ background: "#18181b", color: "#fff" }}>
                Logarithmic
              </option>
              <option value="linear" style={{ background: "#18181b", color: "#fff" }}>
                Linear
              </option>
            </select>
          </div>
        </div>

        <div
          style={{
            fontSize: "12px",
            opacity: 0.7,
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          🎵 Marico Sunbird (<em>Nectarinia mariquensis</em>)
        </div>
      </div>

      <SonoscopeProvider
        url={DEFAULT_AUDIO_URL}
        frequencyScale={scale}
        followPlayback="page"
        audio={audioRef.current || undefined}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "56px 1fr",
            border: "1px solid rgba(128, 128, 128, 0.25)",
            borderRadius: "4px",
            overflow: "hidden",
            background: "transparent",
          }}
        >
          <div
            style={{
              height: "24px",
              borderRight: "1px solid rgba(128, 128, 128, 0.2)",
              borderBottom: "1px solid rgba(128, 128, 128, 0.2)",
              fontSize: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.6,
              fontFamily: "monospace",
            }}
          >
            Hz \ s
          </div>
          <div
            style={{
              position: "relative",
              height: "24px",
              borderBottom: "1px solid rgba(128, 128, 128, 0.2)",
            }}
          >
            <TimeRuler
              height={24}
              tickPosition="top"
              color="rgba(128, 128, 128, 0.75)"
              tickColor="rgba(128, 128, 128, 0.35)"
            />
          </div>

          <div
            style={{
              position: "relative",
              width: "56px",
              height: "260px",
              borderRight: "1px solid rgba(128, 128, 128, 0.2)",
            }}
          >
            <FrequencyRuler
              width={56}
              tickPosition="right"
              color="rgba(128, 128, 128, 0.75)"
              tickColor="rgba(128, 128, 128, 0.35)"
            />
          </div>
          <div style={{ position: "relative", height: "260px" }}>
            <Spectrogram
              height={260}
              colorMap={cmap}
              minValue={-80}
              maxValue={0}
            />
          </div>

          <div
            style={{
              height: "65px",
              borderRight: "1px solid rgba(128, 128, 128, 0.2)",
              borderTop: "1px solid rgba(128, 128, 128, 0.2)",
              fontSize: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.6,
              fontFamily: "monospace",
            }}
          >
            WAV
          </div>
          <div
            style={{
              position: "relative",
              height: "65px",
              borderTop: "1px solid rgba(128, 128, 128, 0.2)",
            }}
          >
            <Waveform height={65} colorMap={cmap} />
          </div>
        </div>
      </SonoscopeProvider>

      <audio
        ref={audioRef}
        src={DEFAULT_AUDIO_URL}
        crossOrigin="anonymous"
        controls
        style={{
          width: "100%",
          height: "36px",
          marginTop: "12px",
          outline: "none",
        }}
      />
    </div>
  );
}
