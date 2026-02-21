from pathlib import Path

MODEL = "ollama_chat/gpt-oss:20b"
DB_PATH = str(Path(__file__).resolve().parent.parent / "mock_financial.sqlite3")
