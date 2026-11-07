"""The only file that talks to a language model: Groq, through its OpenAI-compatible endpoint
(the `openai` Python package is only the HTTP client). Configure it in .env, not in the code:
GROQ_API_KEY / GROQ_MODEL / GROQ_BASE_URL.

If the call fails (429 rate limit, timeout, network, empty answer) we back off and retry;
if it still fails, the student sees BUSY and the app does not crash.

LLM_PROVIDER=groq (default) | none -> no model is called (offline test of the pipeline).
"""
import os
import re
import time

from dotenv import load_dotenv

load_dotenv()
PROVIDER = os.getenv("LLM_PROVIDER", "groq").lower()
MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
API_KEY = os.getenv("GROQ_API_KEY", "")
TIMEOUT = float(os.getenv("LLM_TIMEOUT", "30"))
BUSY = "النظام عليه ضغط هلأ، جرّب كمان شوي"

last_model = None   # the model that answered the last call (shown in the UI)
_client = None      # one HTTP client for the whole process (keeps the connection alive = faster)
# reasoning models: think as little as possible (faster, fewer tokens). Override with LLM_REASONING_EFFORT.
REASONING = os.getenv("LLM_REASONING_EFFORT") or ("low" if "gpt-oss" in MODEL else "none" if "qwen" in MODEL else "")
_reasoning_ok = True


def _call(system, user, max_tokens):
    global _client, _reasoning_ok
    if _client is None:
        from openai import OpenAI
        _client = OpenAI(base_url=BASE_URL, api_key=API_KEY, timeout=TIMEOUT, max_retries=0)
    kw = {}
    if REASONING and _reasoning_ok:
        kw["reasoning_effort"] = REASONING
    try:
        r = _client.chat.completions.create(
            model=MODEL, max_tokens=max_tokens, temperature=0,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}], **kw)
    except Exception as e:
        if kw and "reasoning" in str(e).lower():     # model doesn't accept the parameter: drop it once
            _reasoning_ok = False
            return _call(system, user, max_tokens)
        raise
    text = (r.choices[0].message.content or "").strip()
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()   # reasoning models (e.g. Qwen) may emit this
    if not text:
        raise RuntimeError("empty answer")
    return text


def chat(system: str, user: str, max_tokens: int = 500) -> str:
    global last_model
    if PROVIDER == "none":
        last_model = "none"
        return f"(test mode: no model called, prompt is {len(system) + len(user)} characters)"
    if not (MODEL and API_KEY):
        raise ValueError("Set GROQ_API_KEY and GROQ_MODEL in .env")
    waits = [3, 8, 15]                 # 429 = per-minute limit, so back off and retry
    for attempt in range(len(waits) + 1):
        try:
            text = _call(system, user, max_tokens)
            last_model = MODEL
            return text
        except Exception as e:
            print(f"[llm] {MODEL} failed (try {attempt + 1}): {type(e).__name__}: {str(e)[:150]}")
            if attempt < len(waits):
                time.sleep(waits[attempt])
    last_model = None
    return BUSY


if __name__ == "__main__":
    # quick check:  python -m src.llm
    print(chat("جاوب بجملة وحدة بالعربي.", "شو يعني ساعة معتمدة؟"))
    print("model:", last_model)
