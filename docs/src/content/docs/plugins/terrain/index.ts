import "./styles.css";
import "@sonoscope/terrain-spectrogram/auto";
import { Sonoscope } from "@sonoscope/core";

async function main() {
  const canvas = document.getElementById("spectrogram") as HTMLCanvasElement;
  const audioUrl = "https://xeno-canto.org/1145817/download";

  const scope = await Sonoscope.fromUrl(audioUrl);

  // Initialize 3D terrain shader program
  scope.createSpectrogram(canvas, {
    frequencyScale: "mel",
    minDb: -90,
    maxDb: -20,
    renderer: {
      type: "webgl",
      program: "terrain",
      heightScale: 0.6,
      heightGamma: 1.0,
      fov: 70,
      meshResolution: 64,
      smoothing: 0.6,
      ambientLight: 0.75,
      diffuseLight: 0.35,
      // Camera perspective & angle controls
      cameraPitch: 35, // Tilt angle in degrees (0 = top-down, 45 = isometric, 80 = horizon)
      cameraYaw: 0, // Horizontal orbit rotation
      cameraDistance: 1.5, // Distance from center
    },
  });

  // Enable navigation
  scope.attachNavigation(canvas);
}

main();
