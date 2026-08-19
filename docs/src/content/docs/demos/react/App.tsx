import {
  FrequencyRuler,
  SonoscopeProvider,
  Spectrogram,
  TimeRuler,
  Waveform,
} from "@sonoscope/react";

const audioUrl =
  "https://upload.wikimedia.org/wikipedia/commons/c/c5/Marico_Sunbird_%28Nectarinia_mariquensis%29_%28W1CDR0000941_BD17%29.ogg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original";

export default function App() {
  return (
    <div className="app">
      <SonoscopeProvider
        url={audioUrl}
        frequencyScale="mel"
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
              tickPosition="right"
              color="rgba(128, 128, 128, 0.75)"
              tickColor="rgba(128, 128, 128, 0.35)"
            />
          </div>
          <div className="spectrogram-container">
            <Spectrogram colorMap="plasma" minValue={-80} maxValue={0} />
          </div>
        </div>
        <div className="waveform-container">
          <Waveform height={60} colorMap="plasma" />
        </div>
      </SonoscopeProvider>
    </div>
  );
}
