# AI-Driven Meeting Analysis

A local educational application for meeting transcription, summarization, sentiment analysis, deepfake frame scoring, and report export. The React frontend talks to a FastAPI backend; inference runs locally on CPU by default.

## Repository layout

- `frontend/` — React 19 and Vite 6 application.
- `backend/` — FastAPI routes, AI services, templates, and runtime directories.
- `backend/model/xception_deepfake_final.pt` — tracked Xception weights used for frame analysis.
- `backend/*.whl` — tracked Windows/Python 3.10 wheels referenced by `requirements.txt`.
- `start_app.bat` — optional launcher after both environments have been installed.

Runtime `temp/` and frame-set directories are created automatically. They do not need to exist in a fresh clone.

## Prerequisites

- Windows x64.
- CPython 3.10 x64. The bundled `dlib` wheel is specifically for CPython 3.10 on Windows x64.
- Node.js 22 or newer and npm. The locked Vite version accepts Node 18, 20, or 22+, and validation was performed with Node 24.15.0/npm 11.12.1.
- [FFmpeg](https://ffmpeg.org/download.html) available on `PATH`. Verify with `ffmpeg -version`. It is required for video audio extraction and the WebM record flow; plain MP3/WAV analysis and single-frame analysis do not use it.
- Optional: [wkhtmltopdf 0.12.6](https://wkhtmltopdf.org/downloads) for PDF export.
- Internet access on first backend startup for Hugging Face and NLTK downloads.

The first startup downloads approximately 2.2 GB of model/tokenizer data in the current model set. Together with the Python environment, keep at least 5 GB free. Download time depends on the network and the initial model load can take several minutes.

## Backend setup

Open PowerShell in the repository root:

```powershell
cd backend
py -3.10 -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m pip check
.\venv\Scripts\python.exe -m uvicorn main:app
```

The canonical command runs from `backend/` and serves `http://127.0.0.1:8000`. API documentation is at `http://127.0.0.1:8000/docs`.

Running from the repository root is also supported:

```powershell
backend\venv\Scripts\python.exe -m uvicorn backend.main:app
```

Do not copy an old virtual environment into a new clone. Create it with Python 3.10 as shown above.

## First backend startup

Importing the FastAPI application loads the local Xception weights and downloads/caches these resources when missing:

- `Systran/faster-whisper-base`
- `philschmid/bart-large-cnn-samsum`
- `cardiffnlp/twitter-roberta-base-sentiment`
- NLTK `punkt`

These are stored in user-level Hugging Face/NLTK caches, not in the repository. Subsequent startups reuse the cache.

## Frontend setup

In a second PowerShell window:

```powershell
cd frontend
npm ci
npm run dev
```

Vite normally serves `http://localhost:5173`. The frontend defaults to `http://localhost:8000` for the API. To use another backend URL:

```powershell
Copy-Item .env.example .env
```

Then edit `.env`:

```dotenv
VITE_API_BASE_URL=http://localhost:8000
```

Vite reads this value when the development server starts, so restart `npm run dev` after changing it. Do not commit a real `.env` file.

## PDF export

The backend resolves wkhtmltopdf in this order:

1. `WKHTMLTOPDF_PATH`
2. `wkhtmltopdf` on the system `PATH`

Example for the current PowerShell session:

```powershell
$env:WKHTMLTOPDF_PATH = "C:\path\to\wkhtmltopdf.exe"
```

Without wkhtmltopdf, the rest of the backend still starts and PDF requests return a clear HTTP 503 response. wkhtmltopdf is an older engine; use this local project only with trusted report content.

## Supported input formats

- Normal audio upload: `.mp3`, `.wav`
- Normal video upload: `.mp4`, `.avi`, `.mov`
- Record flow: browser-generated WebM sent to `/transcribe_chunk`; WebM is not accepted by the normal upload endpoint.

## Starting both applications

After completing both setup sections, run `start_app.bat` from the repository root. It opens separate frontend and backend command windows and uses the canonical backend startup command. If `backend/venv` or `frontend/node_modules` is missing, it stops with setup guidance.

## Validation commands

```powershell
# Frontend
cd frontend
npm run build
npm run lint

# Backend
cd ..\backend
.\venv\Scripts\python.exe -m pip check
```

The production frontend build is expected to pass. The repository currently has historical ESLint findings in `public/recorder.js` and existing component code; they do not prevent startup.

## Current limitations

- CPU inference can be slow, especially during summary generation.
- Recording requires browser microphone and screen-sharing permission; system audio depends on the selected share source.
- Generated frame sets are retained until manually managed; automatic expiration is not implemented.
- No database or authentication is used. This is a local learning project, not a production deployment.
