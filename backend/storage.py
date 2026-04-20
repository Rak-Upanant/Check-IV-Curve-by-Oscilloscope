# backend/storage.py
import os
from .database import supabase

BUCKET = "iv-signatures"

def upload_image(local_path: str, storage_path: str, content_type: str = "image/png"):
    with open(local_path, "rb") as f:
        supabase.storage.from_(BUCKET).upload(
            storage_path, f,
            file_options={"content-type": content_type, "upsert": "true"}
        )

def get_public_url(storage_path: str) -> str:
    res = supabase.storage.from_(BUCKET).get_public_url(storage_path)
    return res
