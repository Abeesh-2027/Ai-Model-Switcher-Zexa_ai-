from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import httpx

# ── Conversation history (in-memory, per server session) ──
conversation_history: list[dict] = []

templates = Jinja2Templates(directory="templates")

OLLAMA_BASE = "http://localhost:11434"

# ── Frontend key → actual Ollama model name ──
MODEL_MAP = {
    "llama3":  "llama3",
    "phi3":    "phi3",
    "mistral": "mistral",
    "gemma":   "gemma2",
    "qwen":    "qwen2.5",
}

# ── System prompts per model ──
SYSTEM_PROMPTS = {
    "llama3":  "You are LLaMA 3, a highly capable open-source AI by Meta. You excel at reasoning, coding, and long-context tasks. Be helpful, thorough, and precise.",
    "phi3":    "You are Phi-3, Microsoft's compact and efficient AI. Give fast, concise, and clear answers. Ideal for quick questions.",
    "mistral": "You are Mistral, a creative and multilingual AI by Mistral AI. Excel at creative writing, storytelling, and balanced conversation. Be expressive and engaging.",
    "gemma":   "You are Gemma 2, Google's structured AI assistant. Excel at summarization, Q&A, and organized data. Be clear and well-structured.",
    "qwen":    "You are Qwen 2.5, Alibaba's multilingual powerhouse. Excel at coding, large documents, and multilingual tasks. Be thorough and technically precise.",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")


# =========================
# SCHEMAS
# =========================
class ChatRequest(BaseModel):
    message: str
    model: str = "llama3"


# =========================
# HOME PAGE
# =========================
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(request, "index.html")


# =========================
# CHAT API  (calls Ollama)
# =========================
@app.post("/chat")
async def chat(body: ChatRequest):
    user_message = body.message.strip()
    model_key = body.model if body.model in MODEL_MAP else "llama3"

    if not user_message:
        raise HTTPException(status_code=400, detail="Empty message")

    conversation_history.append({"role": "user", "content": user_message})
    messages_to_send = conversation_history[-20:]

    payload = {
        "model": MODEL_MAP[model_key],
        "messages": [{"role": "system", "content": SYSTEM_PROMPTS[model_key]}, *messages_to_send],
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(f"{OLLAMA_BASE}/api/chat", json=payload)
            response.raise_for_status()
            data = response.json()
            ai_reply = data["message"]["content"]
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="Cannot connect to Ollama. Make sure Ollama is running: `ollama serve`"
        )
    except httpx.HTTPStatusError as e:
        detail = e.response.text or str(e)
        # model not pulled yet
        if "model" in detail.lower() and ("not found" in detail.lower() or "pull" in detail.lower()):
            raise HTTPException(
                status_code=404,
                detail=f"Model '{MODEL_MAP[model_key]}' not found. Run: ollama pull {MODEL_MAP[model_key]}"
            )
        raise HTTPException(status_code=500, detail=f"Ollama error: {detail}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

    conversation_history.append({"role": "assistant", "content": ai_reply})
    return {"response": ai_reply}


# =========================
# LIST AVAILABLE MODELS
# =========================
@app.get("/models")
async def list_models():
    """Returns which Ollama models are currently pulled/available."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{OLLAMA_BASE}/api/tags")
            r.raise_for_status()
            pulled = [m["name"].split(":")[0] for m in r.json().get("models", [])]
            return {
                "available": {k: v in pulled or any(v in p for p in pulled)
                              for k, v in MODEL_MAP.items()},
                "pulled": pulled,
            }
    except Exception:
        return {"available": {k: False for k in MODEL_MAP}, "pulled": []}


# =========================
# CLEAR CHAT
# =========================
@app.post("/clear")
async def clear():
    global conversation_history
    conversation_history = []
    return {"status": "cleared"}


# =========================
# HEALTH
# =========================
@app.get("/health")
async def health():
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{OLLAMA_BASE}/api/tags")
            ollama_ok = r.status_code == 200
    except Exception:
        ollama_ok = False
    return {"status": "ok", "ollama": "running" if ollama_ok else "unreachable"}


# =========================
# START APP
# =========================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)