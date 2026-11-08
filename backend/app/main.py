"""Local session API. Camera frames and inference remain in the browser."""
from __future__ import annotations

from typing import Literal
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Invisibility Mode API", version="1.0.0", description="Local session preferences; no camera frames are accepted or stored.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["GET", "POST"], allow_headers=["*"])

class Settings(BaseModel):
    segmentation_sensitivity: int = Field(default=48, ge=25, le=75)
    mask_smoothing: int = Field(default=5, ge=0, le=12)
    background_blur: bool = False
    gesture_sensitivity: int = Field(default=7, ge=3, le=20)
    processing_quality: Literal["Balanced", "Performance"] = "Balanced"

_settings = Settings()

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "invisibility-mode-api", "inference": "browser-local", "stores_camera_frames": False}

@app.get("/api/settings", response_model=Settings)
async def get_settings():
    return _settings

@app.post("/api/settings", response_model=Settings)
async def update_settings(settings: Settings):
    global _settings
    _settings = settings
    return _settings
