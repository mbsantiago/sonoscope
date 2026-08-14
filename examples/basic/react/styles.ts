export const demoStyles = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: #0d0f12; color: #f4efe7; font-family: Georgia, 'Times New Roman', serif; }
  .shell { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 48px; }
  .hero { display: grid; gap: 10px; max-width: 720px; margin-bottom: 22px; }
  a { color: #d7dce5; text-decoration-thickness: 1px; text-underline-offset: 4px; }
  .eyebrow { margin: 18px 0 0; color: #a9b0bd; font: 700 12px ui-monospace, monospace; letter-spacing: .22em; text-transform: uppercase; }
  h1 { margin: 0; font-size: clamp(2rem, 4vw, 3.7rem); line-height: .98; letter-spacing: -.045em; max-width: 760px; }
  p { margin: 0; max-width: 640px; color: #b9bec8; font-size: 1.05rem; line-height: 1.6; }
  code { color: #eef1f6; }
  .workbench { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 18px; align-items: start; }
  .display-card, .controls { border: 1px solid rgba(255,255,255,.13); background: #12151a; box-shadow: 0 18px 48px rgba(0,0,0,.28); }
  .display-card { padding: 14px; border-radius: 12px; }
  .display-topline { display: flex; justify-content: space-between; gap: 18px; align-items: start; padding: 8px 6px 14px; font-family: ui-monospace, monospace; }
  .display-topline strong, .display-topline span { display: block; }
  .display-topline strong { color: #f4efe7; }
  .display-topline span { color: #89919f; font-size: .82rem; margin-top: 3px; }
  .status { text-align: right; max-width: 310px; }
  audio { width: 100%; margin-top: 12px; margin-bottom: 8px; opacity: .92; }
  .minimap-block { display: grid; gap: 8px; padding: 14px 4px 2px; }
  .minimap-label { display: flex; justify-content: space-between; gap: 12px; color: #89919f; font: 700 12px ui-monospace, monospace; text-transform: uppercase; letter-spacing: .12em; }
  .minimap-label b { color: #d7dce5; font-weight: 700; text-transform: none; letter-spacing: 0; }
  .minimap { position: relative; height: 54px; overflow: hidden; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; background: #0d0f12; cursor: pointer; touch-action: none; }
  .minimap:focus-visible { outline: 2px solid #d7dce5; outline-offset: 3px; }
  .minimap-wave { position: absolute; inset: 8px 10px; display: flex; align-items: center; gap: 3px; opacity: .58; }
  .minimap-wave i { flex: 1; min-width: 2px; background: #7d8591; }
  .minimap-window { position: absolute; inset-block: 0; min-width: 18px; border: 2px solid #f4efe7; border-radius: 6px; background: rgba(244,239,231,.08); box-shadow: 0 0 0 999px rgba(0,0,0,.28); cursor: grab; }
  .minimap-window::before, .minimap-window::after { content: ''; position: absolute; top: 14px; bottom: 14px; width: 2px; background: rgba(244,239,231,.68); }
  .minimap-window::before { left: 8px; }
  .minimap-window::after { right: 8px; }
  .minimap-playhead { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #f4efe7; box-shadow: 0 0 0 1px rgba(0,0,0,.45); pointer-events: none; }
  .cache-summary { padding: 6px 4px 0; color: #89919f; font: 700 12px ui-monospace, monospace; }
  .controls { display: grid; gap: 16px; padding: 18px; border-radius: 12px; position: sticky; top: 16px; }
  .control-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  label { display: grid; gap: 7px; color: #89919f; font: 700 12px ui-monospace, monospace; text-transform: uppercase; letter-spacing: .12em; }
  label span { display: flex; justify-content: space-between; gap: 10px; }
  label b { color: #d7dce5; font-weight: 700; }
  select, button { width: 100%; border: 1px solid rgba(255,255,255,.12); border-radius: 6px; background: #171a20; color: #f4efe7; padding: 10px 12px; font: 700 13px ui-monospace, monospace; }
  button { background: #e6e9ef; color: #101216; cursor: pointer; text-transform: uppercase; letter-spacing: .12em; }
  input[type='range'] { accent-color: #d7dce5; width: 100%; }
  @media (max-width: 900px) { .workbench { grid-template-columns: 1fr; } .controls { position: static; } h1 { letter-spacing: -.05em; } }
`;
