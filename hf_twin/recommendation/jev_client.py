"""
Minimal Jev (TypeSafe) client over plain HTTP, following how the 7Targets project uses it.

  endpoint  https://api.typesafe.ai/v1/systemone      model "jev-latest" (the response reports the version used)
  request   {"model", "state": text, "questions": {name: {"type": "choice"|"score", "instructions", "criteria"}}}
  choice    criteria = {option_id: description}  -> answers[name] = {choice, confidence, probabilities}
  score     criteria = ordered list (rubric)     -> answers[name] = {score, confidence}

The key is read from the environment or from .env (names JEV_API_KEY or JEV_TYPESAFE_API_KEY); it is never printed or
logged. Network or HTTP failures raise JevError so the caller can fail safe (abstain).
"""

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

ENDPOINT = "https://api.typesafe.ai/v1/systemone"
MODEL = "jev-latest"
KEY_NAMES = ("JEV_API_KEY", "JEV_TYPESAFE_API_KEY")
RETRY_STATUS = {429, 500, 502, 503, 504, 520, 529}
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class JevError(RuntimeError):
    pass


def _load_key() -> str:
    for name in KEY_NAMES:
        if os.environ.get(name):
            return os.environ[name].strip()
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            name, _, value = line.strip().partition("=")
            if name in KEY_NAMES and value:
                return value.strip().strip('"').strip("'")
    raise JevError("Jev API key not found (set JEV_API_KEY in the environment or in .env)")


def call(questions: dict, state: str, tries: int = 4, timeout: int = 60) -> dict:
    body = json.dumps({"model": MODEL, "state": state, "questions": questions}).encode("utf-8")
    headers = {"Authorization": f"Bearer {_load_key()}", "Content-Type": "application/json"}
    last = "unknown error"
    for attempt in range(1, tries + 1):
        try:
            req = urllib.request.Request(ENDPOINT, data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            if e.code not in RETRY_STATUS:
                raise JevError(last) from None
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = type(e).__name__
        time.sleep(2 ** attempt)
    raise JevError(f"Jev unavailable after {tries} tries ({last})")


def choose(state: str, instructions: str, options: dict) -> dict:
    """Pick one option. Returns {choice, confidence, probabilities, model, usage}."""
    data = call({"action": {"type": "choice", "instructions": instructions, "criteria": options}}, state)
    a = data["answers"]["action"]
    return {"choice": a["choice"], "confidence": float(a["confidence"]), "probabilities": a.get("probabilities", {}),
            "model": data.get("model"), "usage": data.get("usage")}


def score(state: str, instructions: str, rubric: list[str]) -> dict:
    """Rate against an ordered rubric (index 0 = worst). Returns {score, confidence, model, usage}."""
    data = call({"support": {"type": "score", "instructions": instructions, "criteria": rubric}}, state)
    a = data["answers"]["support"]
    return {"score": float(a["score"]), "confidence": float(a.get("confidence", 0.0)),
            "model": data.get("model"), "usage": data.get("usage")}
