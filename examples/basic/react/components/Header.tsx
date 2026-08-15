import type React from "react";

export function Header(): React.ReactElement {
  return (
    <section className="hero">
      <a href="./index.html">Back to demos</a>
      <p className="eyebrow">React integration (@sonoscope/react)</p>
      <h1>
        Declarative &lt;Waveform /&gt; &amp; &lt;Spectrogram /&gt; Components
      </h1>
      <p>
        Powered by <code>useSonoscope</code>,{" "}
        <code>&lt;SonoscopeProvider /&gt;</code>,<code>&lt;Waveform /&gt;</code>
        , and <code>&lt;Spectrogram /&gt;</code> from
        <code>@sonoscope/react</code>. React manages declarative application
        state; Sonoscope coordinates audio decoding, time viewport
        synchronization, WebGL2 hardware rendering, and WASM compute.
      </p>
    </section>
  );
}
