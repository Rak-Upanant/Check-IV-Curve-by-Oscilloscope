# backend/database.py
import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()  # loads .env from project root automatically

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]   # service role key (backend only)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
