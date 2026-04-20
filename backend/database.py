# backend/database.py
import os
from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]   # service role key (backend only)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
