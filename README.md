# Sagan

Repo organized into two apps:

- `server/`: FastAPI + SQLModel + SQLite backend
- `portal/`: React + TypeScript + Material UI frontend scaffold

## Structure

```text
server/
  app/
  data/
  requirements.txt
  seed_data.py
portal/
  src/
  package.json
railway.json
```

## Run the backend

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r server\requirements.txt
uvicorn app.main:app --app-dir server --reload
```

Backend docs:

- Swagger UI: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/health`

SQLite lives at `server/data/sagan.db`.

To generate PDFs On Windows Install https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer/releases

## Seed test data

```powershell
.\.venv\Scripts\python.exe server\seed_data.py
```

## Run the frontend

```powershell
cd portal
npm install
npm run dev
```

Set `VITE_API_BASE_URL` if your API is not running at `http://127.0.0.1:8000`.

## Railway

`railway.json` starts the API from the `server/` folder using:

```bash
uvicorn app.main:app --app-dir server --host 0.0.0.0 --port $PORT
```

Mount your persistent volume for the backend database at `server/data`.
