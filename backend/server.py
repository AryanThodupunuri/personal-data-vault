from fastapi import FastAPI, APIRouter, HTTPException, status, Depends, BackgroundTasks, Header
from fastapi.responses import RedirectResponse, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
from cryptography.fernet import Fernet
import os
import logging
from pathlib import Path
import uuid
import hashlib
import json
import httpx
import asyncio
import io
import csv
import zipfile
import base64
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'data_vault_db')]

# Create the main app
app = FastAPI(title="Personal Data Vault API", version="1.0.0")
api_router = APIRouter(prefix="/api")

# Security setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-key')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 30

# Encryption setup
ENCRYPTION_KEY = os.environ.get('MASTER_ENCRYPTION_KEY', 'default-key')
fernet = Fernet(base64.urlsafe_b64encode(ENCRYPTION_KEY.encode().ljust(32)[:32]))

# OAuth Config
REDIRECT_URI_BASE = os.environ.get('REDIRECT_URI_BASE', 'http://localhost:3000')
SPOTIFY_CLIENT_ID = os.environ.get('SPOTIFY_CLIENT_ID', '')
SPOTIFY_CLIENT_SECRET = os.environ.get('SPOTIFY_CLIENT_SECRET', '')
STRAVA_CLIENT_ID = os.environ.get('STRAVA_CLIENT_ID', '')
STRAVA_CLIENT_SECRET = os.environ.get('STRAVA_CLIENT_SECRET', '')
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')

# LLM Config
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ===================== MODELS =====================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    id: str
    email: str
    name: str
    created_at: datetime

class Connection(BaseModel):
    id: str
    user_id: str
    provider: str
    provider_user_id: str
    encrypted_access_token: str
    encrypted_refresh_token: str
    token_expires_at: datetime
    last_sync_at: Optional[datetime] = None
    sync_status: str = "pending"
    sync_error: Optional[str] = None
    is_active: bool = True
    created_at: datetime

class Record(BaseModel):
    id: str
    user_id: str
    dataset: str
    provider: str
    provider_record_id: str
    recorded_at: datetime
    body: Dict[str, Any]
    hash: str
    created_at: datetime

class AuditLog(BaseModel):
    id: str
    user_id: str
    action: str
    provider: Optional[str] = None
    details: Dict[str, Any] = {}
    timestamp: datetime

class ExportRecord(BaseModel):
    id: str
    user_id: str
    file_name: str
    file_size: int
    download_token: str
    expires_at: datetime
    created_at: datetime

# ===================== HELPER FUNCTIONS =====================

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_jwt_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRATION_DAYS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def encrypt_token(token: str) -> str:
    return fernet.encrypt(token.encode()).decode()

def decrypt_token(encrypted_token: str) -> str:
    return fernet.decrypt(encrypted_token.encode()).decode()

def generate_record_hash(provider: str, provider_record_id: str) -> str:
    return hashlib.sha256(f"{provider}:{provider_record_id}".encode()).hexdigest()

async def get_current_user(authorization: Optional[str] = Header(None)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        
        user_doc = await db.users.find_one({"id": user_id})
        if not user_doc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        
        return User(**user_doc)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

async def log_audit(user_id: str, action: str, provider: Optional[str] = None, details: Dict[str, Any] = {}):
    audit = AuditLog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        action=action,
        provider=provider,
        details=details,
        timestamp=datetime.now(timezone.utc)
    )
    await db.audit_logs.insert_one(audit.dict())

# ===================== AUTH ENDPOINTS =====================

@api_router.post("/auth/signup")
async def signup(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    
    user = User(
        id=str(uuid.uuid4()),
        email=user_data.email,
        name=user_data.name,
        created_at=datetime.now(timezone.utc)
    )
    
    await db.users.insert_one(user.dict())
    await db.user_passwords.insert_one({
        "user_id": user.id,
        "hashed_password": hash_password(user_data.password),
        "created_at": datetime.now(timezone.utc)
    })
    
    token = create_jwt_token({"sub": user.id})
    return {"token": token, "user": user}

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user_doc = await db.users.find_one({"email": credentials.email})
    if not user_doc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    
    password_doc = await db.user_passwords.find_one({"user_id": user_doc["id"]})
    if not password_doc or not verify_password(credentials.password, password_doc["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    
    user = User(**user_doc)
    token = create_jwt_token({"sub": user.id})
    return {"token": token, "user": user}

@api_router.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

# ===================== OAUTH ENDPOINTS =====================

@api_router.get("/oauth/{provider}/authorize")
async def oauth_authorize(provider: str, current_user: User = Depends(get_current_user)):
    state = f"{current_user.id}:{provider}:{uuid.uuid4()}"
    
    if provider == "spotify":
        if not SPOTIFY_CLIENT_ID:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, 
                              detail="Spotify not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env")
        
        auth_url = (
            f"https://accounts.spotify.com/authorize"
            f"?client_id={SPOTIFY_CLIENT_ID}"
            f"&response_type=code"
            f"&redirect_uri={REDIRECT_URI_BASE}/oauth/callback/{provider}"
            f"&scope=user-read-recently-played user-read-playback-state"
            f"&state={state}"
        )
        return {"auth_url": auth_url}
    
    elif provider == "strava":
        if not STRAVA_CLIENT_ID:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                              detail="Strava not configured. Add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET to .env")
        
        auth_url = (
            f"https://www.strava.com/oauth/authorize"
            f"?client_id={STRAVA_CLIENT_ID}"
            f"&response_type=code"
            f"&redirect_uri={REDIRECT_URI_BASE}/oauth/callback/{provider}"
            f"&scope=activity:read_all"
            f"&state={state}"
        )
        return {"auth_url": auth_url}
    
    elif provider == "google_calendar":
        if not GOOGLE_CLIENT_ID:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                              detail="Google Calendar not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env")
        
        auth_url = (
            f"https://accounts.google.com/o/oauth2/v2/auth"
            f"?client_id={GOOGLE_CLIENT_ID}"
            f"&response_type=code"
            f"&redirect_uri={REDIRECT_URI_BASE}/oauth/callback/{provider}"
            f"&scope=https://www.googleapis.com/auth/calendar.readonly"
            f"&access_type=offline"
            f"&state={state}"
        )
        return {"auth_url": auth_url}
    
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported provider")

@api_router.get("/oauth/callback/{provider}")
async def oauth_callback(provider: str, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    if error:
        return RedirectResponse(url=f"/?error={error}")
    
    if not code or not state:
        return RedirectResponse(url="/?error=missing_parameters")
    
    try:
        user_id, provider_from_state, _ = state.split(":")
    except:
        return RedirectResponse(url="/?error=invalid_state")
    
    try:
        if provider == "spotify":
            async with httpx.AsyncClient() as client:
                token_response = await client.post(
                    "https://accounts.spotify.com/api/token",
                    data={
                        "grant_type": "authorization_code",
                        "code": code,
                        "redirect_uri": f"{REDIRECT_URI_BASE}/oauth/callback/{provider}",
                        "client_id": SPOTIFY_CLIENT_ID,
                        "client_secret": SPOTIFY_CLIENT_SECRET
                    }
                )
            
            if token_response.status_code != 200:
                return RedirectResponse(url="/?error=token_exchange_failed")
            
            token_data = token_response.json()
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))
            
            async with httpx.AsyncClient() as client:
                profile_response = await client.get(
                    "https://api.spotify.com/v1/me",
                    headers={"Authorization": f"Bearer {token_data['access_token']}"}
                )
            profile = profile_response.json()
            provider_user_id = profile.get("id", "unknown")
        
        elif provider == "strava":
            async with httpx.AsyncClient() as client:
                token_response = await client.post(
                    "https://www.strava.com/oauth/token",
                    data={
                        "client_id": STRAVA_CLIENT_ID,
                        "client_secret": STRAVA_CLIENT_SECRET,
                        "code": code,
                        "grant_type": "authorization_code"
                    }
                )
            
            if token_response.status_code != 200:
                return RedirectResponse(url="/?error=token_exchange_failed")
            
            token_data = token_response.json()
            expires_at = datetime.fromtimestamp(token_data.get("expires_at", 0), tz=timezone.utc)
            provider_user_id = str(token_data.get("athlete", {}).get("id", "unknown"))
        
        elif provider == "google_calendar":
            async with httpx.AsyncClient() as client:
                token_response = await client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "code": code,
                        "client_id": GOOGLE_CLIENT_ID,
                        "client_secret": GOOGLE_CLIENT_SECRET,
                        "redirect_uri": f"{REDIRECT_URI_BASE}/oauth/callback/{provider}",
                        "grant_type": "authorization_code"
                    }
                )
            
            if token_response.status_code != 200:
                return RedirectResponse(url="/?error=token_exchange_failed")
            
            token_data = token_response.json()
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))
            provider_user_id = "google_user"
        
        else:
            return RedirectResponse(url="/?error=unsupported_provider")
        
        connection = Connection(
            id=str(uuid.uuid4()),
            user_id=user_id,
            provider=provider,
            provider_user_id=provider_user_id,
            encrypted_access_token=encrypt_token(token_data["access_token"]),
            encrypted_refresh_token=encrypt_token(token_data.get("refresh_token", "")),
            token_expires_at=expires_at,
            is_active=True,
            sync_status="pending",
            created_at=datetime.now(timezone.utc)
        )
        
        await db.connections.delete_many({"user_id": user_id, "provider": provider})
        await db.connections.insert_one(connection.dict())
        await log_audit(user_id, "connect", provider, {"provider_user_id": provider_user_id})
        
        return RedirectResponse(url="/connections?success=true")
    
    except Exception as e:
        logger.error(f"OAuth callback error: {str(e)}")
        return RedirectResponse(url=f"/?error=callback_exception")

# ===================== SYNC LOGIC =====================

async def sync_spotify(user_id: str, connection: Connection):
    try:
        access_token = decrypt_token(connection.encrypted_access_token)
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.spotify.com/v1/me/player/recently-played",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"limit": 50}
            )
        
        if response.status_code != 200:
            return {"error": f"Failed: {response.status_code}"}
        
        data = response.json()
        tracks = data.get("items", [])
        sync_stats = {"new": 0, "existing": 0}
        
        for track_item in tracks:
            track = track_item.get("track", {})
            played_at = track_item.get("played_at")
            
            provider_record_id = f"{track.get('id')}:{played_at}"
            record_hash = generate_record_hash("spotify", provider_record_id)
            
            existing = await db.records.find_one({"hash": record_hash})
            if existing:
                sync_stats["existing"] += 1
                continue
            
            record = Record(
                id=str(uuid.uuid4()),
                user_id=user_id,
                dataset="tracks",
                provider="spotify",
                provider_record_id=provider_record_id,
                recorded_at=datetime.fromisoformat(played_at.replace("Z", "+00:00")),
                body={
                    "title": track.get("name"),
                    "artist": ", ".join([a.get("name", "") for a in track.get("artists", [])]),
                    "album": track.get("album", {}).get("name"),
                    "duration_ms": track.get("duration_ms"),
                    "played_at": played_at,
                    "source": "spotify"
                },
                hash=record_hash,
                created_at=datetime.now(timezone.utc)
            )
            
            await db.records.insert_one(record.dict())
            sync_stats["new"] += 1
        
        return sync_stats
    except Exception as e:
        logger.error(f"Spotify sync error: {str(e)}")
        return {"error": str(e)}

async def sync_strava(user_id: str, connection: Connection):
    try:
        access_token = decrypt_token(connection.encrypted_access_token)
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://www.strava.com/api/v3/athlete/activities",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"per_page": 50}
            )
        
        if response.status_code != 200:
            return {"error": f"Failed: {response.status_code}"}
        
        activities = response.json()
        sync_stats = {"new": 0, "existing": 0}
        
        for activity in activities:
            provider_record_id = str(activity.get("id"))
            record_hash = generate_record_hash("strava", provider_record_id)
            
            existing = await db.records.find_one({"hash": record_hash})
            if existing:
                sync_stats["existing"] += 1
                continue
            
            record = Record(
                id=str(uuid.uuid4()),
                user_id=user_id,
                dataset="workouts",
                provider="strava",
                provider_record_id=provider_record_id,
                recorded_at=datetime.fromisoformat(activity.get("start_date", "").replace("Z", "+00:00")),
                body={
                    "name": activity.get("name"),
                    "type": activity.get("type"),
                    "distance_km": activity.get("distance", 0) / 1000,
                    "duration_s": activity.get("moving_time", 0),
                    "elevation_gain": activity.get("total_elevation_gain", 0),
                    "start_time": activity.get("start_date"),
                    "source": "strava"
                },
                hash=record_hash,
                created_at=datetime.now(timezone.utc)
            )
            
            await db.records.insert_one(record.dict())
            sync_stats["new"] += 1
        
        return sync_stats
    except Exception as e:
        logger.error(f"Strava sync error: {str(e)}")
        return {"error": str(e)}

async def sync_google_calendar(user_id: str, connection: Connection):
    try:
        access_token = decrypt_token(connection.encrypted_access_token)
        time_min = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                headers={"Authorization": f"Bearer {access_token}"},
                params={
                    "timeMin": time_min,
                    "maxResults": 100,
                    "singleEvents": True,
                    "orderBy": "startTime"
                }
            )
        
        if response.status_code != 200:
            return {"error": f"Failed: {response.status_code}"}
        
        data = response.json()
        events = data.get("items", [])
        sync_stats = {"new": 0, "existing": 0}
        
        for event in events:
            provider_record_id = event.get("id")
            record_hash = generate_record_hash("google_calendar", provider_record_id)
            
            existing = await db.records.find_one({"hash": record_hash})
            if existing:
                sync_stats["existing"] += 1
                continue
            
            start_time = event.get("start", {}).get("dateTime") or event.get("start", {}).get("date")
            if start_time:
                recorded_at = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            else:
                recorded_at = datetime.now(timezone.utc)
            
            record = Record(
                id=str(uuid.uuid4()),
                user_id=user_id,
                dataset="events",
                provider="google_calendar",
                provider_record_id=provider_record_id,
                recorded_at=recorded_at,
                body={
                    "summary": event.get("summary"),
                    "description": event.get("description"),
                    "location": event.get("location"),
                    "start_time": start_time,
                    "end_time": event.get("end", {}).get("dateTime") or event.get("end", {}).get("date"),
                    "attendees": len(event.get("attendees", [])),
                    "source": "google_calendar"
                },
                hash=record_hash,
                created_at=datetime.now(timezone.utc)
            )
            
            await db.records.insert_one(record.dict())
            sync_stats["new"] += 1
        
        return sync_stats
    except Exception as e:
        logger.error(f"Google Calendar sync error: {str(e)}")
        return {"error": str(e)}

async def perform_sync(user_id: str, provider: str):
    connection_doc = await db.connections.find_one({"user_id": user_id, "provider": provider, "is_active": True})
    if not connection_doc:
        return
    
    connection = Connection(**connection_doc)
    await db.connections.update_one({"id": connection.id}, {"$set": {"sync_status": "syncing"}})
    
    if provider == "spotify":
        result = await sync_spotify(user_id, connection)
    elif provider == "strava":
        result = await sync_strava(user_id, connection)
    elif provider == "google_calendar":
        result = await sync_google_calendar(user_id, connection)
    else:
        result = {"error": "Unsupported provider"}
    
    if "error" in result:
        await db.connections.update_one(
            {"id": connection.id},
            {"$set": {"sync_status": "error", "sync_error": result["error"], "last_sync_at": datetime.now(timezone.utc)}}
        )
    else:
        await db.connections.update_one(
            {"id": connection.id},
            {"$set": {"sync_status": "success", "sync_error": None, "last_sync_at": datetime.now(timezone.utc)}}
        )
    
    await log_audit(user_id, "sync", provider, result)

@api_router.post("/sync/{provider}")
async def trigger_sync(provider: str, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    connection = await db.connections.find_one({"user_id": current_user.id, "provider": provider, "is_active": True})
    
    if not connection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    
    background_tasks.add_task(perform_sync, current_user.id, provider)
    return {"message": f"Sync initiated for {provider}", "status": "pending"}

# ===================== DATA ENDPOINTS =====================

@api_router.get("/connections")
async def get_connections(current_user: User = Depends(get_current_user)):
    connections = await db.connections.find({"user_id": current_user.id}).to_list(100)
    return [Connection(**conn) for conn in connections]

@api_router.delete("/providers/{provider}")
async def delete_provider(provider: str, current_user: User = Depends(get_current_user)):
    result = await db.connections.delete_many({"user_id": current_user.id, "provider": provider})
    records_result = await db.records.delete_many({"user_id": current_user.id, "provider": provider})
    await log_audit(current_user.id, "disconnect", provider, {"connections_deleted": result.deleted_count, "records_deleted": records_result.deleted_count})
    
    return {"message": f"Provider {provider} disconnected", "connections_deleted": result.deleted_count, "records_deleted": records_result.deleted_count}

@api_router.get("/records")
async def get_records(
    dataset: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 100,
    cursor: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    query = {"user_id": current_user.id}
    
    if dataset:
        query["dataset"] = dataset
    
    if start or end:
        query["recorded_at"] = {}
        if start:
            query["recorded_at"]["$gte"] = datetime.fromisoformat(start)
        if end:
            query["recorded_at"]["$lte"] = datetime.fromisoformat(end)
    
    if cursor:
        query["id"] = {"$gt": cursor}
    
    records = await db.records.find(query).sort("recorded_at", -1).limit(limit).to_list(limit)
    
    return {"records": [Record(**rec) for rec in records], "next_cursor": records[-1]["id"] if records else None}

@api_router.get("/insights/summary")
async def get_insights_summary(range_days: int = 30, use_ai: bool = False, current_user: User = Depends(get_current_user)):
    start_date = datetime.now(timezone.utc) - timedelta(days=range_days)
    
    tracks_count = await db.records.count_documents({"user_id": current_user.id, "dataset": "tracks", "recorded_at": {"$gte": start_date}})
    workouts_count = await db.records.count_documents({"user_id": current_user.id, "dataset": "workouts", "recorded_at": {"$gte": start_date}})
    events_count = await db.records.count_documents({"user_id": current_user.id, "dataset": "events", "recorded_at": {"$gte": start_date}})
    
    tracks_pipeline = [
        {"$match": {"user_id": current_user.id, "dataset": "tracks", "recorded_at": {"$gte": start_date}}},
        {"$group": {"_id": "$body.artist", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]
    top_artists = await db.records.aggregate(tracks_pipeline).to_list(5)
    
    workouts_pipeline = [
        {"$match": {"user_id": current_user.id, "dataset": "workouts", "recorded_at": {"$gte": start_date}}},
        {"$group": {"_id": None, "total_distance": {"$sum": "$body.distance_km"}, "total_duration": {"$sum": "$body.duration_s"}}}
    ]
    workout_stats_result = await db.records.aggregate(workouts_pipeline).to_list(1)
    workout_stats = workout_stats_result[0] if workout_stats_result else {"total_distance": 0, "total_duration": 0}
    
    summary = {
        "range_days": range_days,
        "tracks_count": tracks_count,
        "workouts_count": workouts_count,
        "events_count": events_count,
        "top_artists": [{"artist": item["_id"], "count": item["count"]} for item in top_artists],
        "total_workout_distance_km": round(workout_stats.get("total_distance", 0), 2),
        "total_workout_hours": round(workout_stats.get("total_duration", 0) / 3600, 2),
    }
    
    if use_ai and EMERGENT_LLM_KEY:
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"insights_{current_user.id}",
                system_message="You are a helpful data analyst."
            ).with_model("openai", "gpt-4o-mini")
            
            prompt = f"""Based on the last {range_days} days:
- {tracks_count} tracks listened
- Top artists: {', '.join([a['artist'] for a in summary['top_artists'][:3]])}
- {workouts_count} workouts, {summary['total_workout_distance_km']} km
- {events_count} calendar events

Write 2-3 sentences with insights."""
            
            user_message = UserMessage(text=prompt)
            ai_response = await chat.send_message(user_message)
            summary["ai_narrative"] = ai_response
        except Exception as e:
            logger.error(f"AI summary error: {str(e)}")
            summary["ai_narrative"] = "AI summary unavailable"
    
    return summary

# ===================== EXPORT ENDPOINTS =====================

@api_router.post("/export")
async def create_export(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    records = await db.records.find({"user_id": current_user.id}).to_list(10000)
    
    if not records:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No records to export")
    
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        datasets = {}
        for record in records:
            dataset = record.get("dataset", "unknown")
            if dataset not in datasets:
                datasets[dataset] = []
            datasets[dataset].append(record)
        
        for dataset, dataset_records in datasets.items():
            json_data = []
            for rec in dataset_records:
                json_data.append({
                    "id": rec["id"],
                    "recorded_at": rec["recorded_at"].isoformat(),
                    "provider": rec["provider"],
                    **rec["body"]
                })
            
            zip_file.writestr(f"{dataset}.json", json.dumps(json_data, indent=2))
            
            if json_data:
                csv_buffer = io.StringIO()
                fieldnames = list(json_data[0].keys())
                writer = csv.DictWriter(csv_buffer, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(json_data)
                zip_file.writestr(f"{dataset}.csv", csv_buffer.getvalue())
        
        schema_info = {
            "export_date": datetime.now(timezone.utc).isoformat(),
            "user_id": current_user.id,
            "total_records": len(records),
            "datasets": list(datasets.keys())
        }
        zip_file.writestr("schema.json", json.dumps(schema_info, indent=2))
    
    zip_data = zip_buffer.getvalue()
    download_token = str(uuid.uuid4())
    file_name = f"data_vault_export_{current_user.id}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.zip"
    
    export_record = ExportRecord(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        file_name=file_name,
        file_size=len(zip_data),
        download_token=download_token,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
        created_at=datetime.now(timezone.utc)
    )
    
    from gridfs import GridFS
    fs = GridFS(db)
    file_id = fs.put(zip_data, filename=file_name, download_token=download_token)
    
    export_dict = export_record.dict()
    export_dict["gridfs_file_id"] = str(file_id)
    await db.exports.insert_one(export_dict)
    
    await log_audit(current_user.id, "export", None, {"file_size": len(zip_data), "records": len(records)})
    
    return {
        "message": "Export created",
        "download_token": download_token,
        "file_name": file_name,
        "file_size": len(zip_data),
        "expires_at": export_record.expires_at
    }

@api_router.get("/export/download/{download_token}")
async def download_export(download_token: str):
    export_doc = await db.exports.find_one({"download_token": download_token})
    
    if not export_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found")
    
    export = ExportRecord(**export_doc)
    
    if export.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Export link expired")
    
    from gridfs import GridFS
    fs = GridFS(db)
    file_id = export_doc.get("gridfs_file_id")
    
    if not file_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    
    try:
        from bson import ObjectId
        grid_out = fs.get(ObjectId(file_id))
        file_data = grid_out.read()
        
        temp_path = f"/tmp/{export.file_name}"
        with open(temp_path, "wb") as f:
            f.write(file_data)
        
        return FileResponse(temp_path, media_type="application/zip", filename=export.file_name)
    except Exception as e:
        logger.error(f"Download error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Download failed")

@api_router.get("/exports")
async def get_exports(current_user: User = Depends(get_current_user)):
    exports = await db.exports.find({"user_id": current_user.id}).sort("created_at", -1).limit(20).to_list(20)
    return [ExportRecord(**exp) for exp in exports]

# ===================== DELETE ENDPOINTS =====================

@api_router.delete("/account")
async def delete_account(current_user: User = Depends(get_current_user)):
    await db.connections.delete_many({"user_id": current_user.id})
    await db.records.delete_many({"user_id": current_user.id})
    await db.exports.delete_many({"user_id": current_user.id})
    await db.user_passwords.delete_many({"user_id": current_user.id})
    await log_audit(current_user.id, "delete_account", None, {"timestamp": datetime.now(timezone.utc).isoformat()})
    await db.users.delete_one({"id": current_user.id})
    
    return {"message": "Account deleted successfully"}

@api_router.get("/audit-logs")
async def get_audit_logs(limit: int = 50, current_user: User = Depends(get_current_user)):
    logs = await db.audit_logs.find({"user_id": current_user.id}).sort("timestamp", -1).limit(limit).to_list(limit)
    return [AuditLog(**log) for log in logs]

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
