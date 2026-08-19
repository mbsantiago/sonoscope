# sonoscope

[![PyPI version](https://img.shields.io/pypi/v/sonoscope?logo=pypi&color=d0a215)](https://pypi.org/project/sonoscope/)
[![CI](https://github.com/mbsantiago/sonoscope/actions/workflows/ci.yml/badge.svg)](https://github.com/mbsantiago/sonoscope/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Interactive WebGL2 & WASM audio visualization widget for JupyterLab, VS Code, Google Colab, and Marimo.

```sh
pip install sonoscope
```

or with [uv](https://github.com/astral-sh/uv):

```sh
uv add sonoscope
```

## Usage
 
```python
import numpy as np
from sonoscope import Sonoscope

# 1. From local file path (no HTTP server required, syncs via binary traitlets)
widget = Sonoscope.from_file("my_audio.wav")

# 2. From NumPy array and sample rate
sr = 22050
y = np.sin(2 * np.pi * 440 * np.linspace(0, 5, sr * 5, endpoint=False))
widget = Sonoscope.from_array(y, sample_rate=sr, cmap="plasma", frequency_scale="mel")

# 3. From remote URL
widget = Sonoscope.from_url("https://example.com/sample.mp3")

# Display in notebook
widget
```

## Development


We recommend using [uv](https://github.com/astral-sh/uv) for development.
It will automatically manage virtual environments and dependencies for you.

```sh
uv run jupyter lab example.ipynb
```

Alternatively, create and manage your own virtual environment:

```sh
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
jupyter lab example.ipynb
```

The widget front-end code bundles it's JavaScript dependencies. After setting up Python,
make sure to install these dependencies locally:

```sh
npm install
```

While developing, you can run the following in a separate terminal to automatically
rebuild JavaScript as you make changes:

```sh
npm run dev
```

Open `example.ipynb` in JupyterLab, VS Code, or your favorite editor
to start developing. Changes made in `js/` will be reflected
in the notebook.
