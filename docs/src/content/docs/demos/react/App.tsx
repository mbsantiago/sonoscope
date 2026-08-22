import "./styles.css";
import {
  FrequencyRuler,
  SonoscopeProvider,
  Spectrogram,
  TimeRuler,
  Waveform,
} from "@sonoscope/react";

const audioUrl = "https://xeno-canto.org/1145817/download";

export default function App() {
  return (
    <div className="app">
      <SonoscopeProvider
        url={audioUrl}
        followPlayback="page"
      >
        <div className="viewer-grid">
          <div className="corner">Hz \ s</div>
          <div className="time-ruler-container">
            <TimeRuler
              height={24}
              tickPosition="top"
              color="rgba(128, 128, 128, 0.75)"
              tickColor="rgba(128, 128, 128, 0.35)"
            />
          </div>
          <div className="freq-ruler-container">
            <FrequencyRuler
              width={56}
              frequencyScale="mel"
              tickPosition="right"
              color="rgba(128, 128, 128, 0.75)"
              tickColor="rgba(128, 128, 128, 0.35)"
            />
          </div>
          <div className="spectrogram-container">
            <Spectrogram colorMap="plasma" frequencyScale="mel" minValue={-80} maxValue={0} />
          </div>
        </div>
        <div className="waveform-container">
          <Waveform height={60} colorMap="plasma" />
        </div>
      </SonoscopeProvider>
    </div>
  );
}
