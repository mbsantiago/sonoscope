import type React from "react";

export function Header(): React.ReactElement {
  return (
    <section className="hero">
      <a href="./index.html">Back to demos</a>
      <p className="eyebrow">React integration (@sonogram/react)</p>
      <h1>Declarative &lt;Spectrogram /&gt; Component</h1>
      <p>
        Powered by the exported <code>&lt;Spectrogram /&gt;</code> component
        from <code>@sonogram/react</code>. React manages declarative application
        state; Sonogram handles WebGL2 hardware rendering, WebCodecs streaming,
        and WASM compute.
      </p>
    </section>
  );
}
