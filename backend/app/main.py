from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Regex for development origins
origins_regex = r"null|https?://(localhost|127\.0\.0\.1)(:\d+)?|https?://.*\.trycloudflare\.com|https?://.*\.ngrok\.io|https://ruttinon\.github\.io"

from .config import (
    STATIC_UPLOADS_PATH,
    UPLOADS_DIR,
)
from .database import init_database

from .routes import asset_routes, auth_routes, project_routes, report_routes, scan_routes, service_routes

init_database()

app = FastAPI(
    title="Energy Services Platform API",
    description="Backend API for the Energy Services Platform.",
    version="1.0.0",
)

# CORS configurations for Frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=origins_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(project_routes.router)
app.include_router(asset_routes.router)
app.include_router(service_routes.router)
app.include_router(report_routes.router)
app.include_router(scan_routes.router)
app.include_router(auth_routes.router)
app.mount(STATIC_UPLOADS_PATH, StaticFiles(directory=UPLOADS_DIR), name="uploads")

@app.get("/")
def read_root():
    return {
        "message": "Welcome to Energy Service Management System API",
        "database": "sqlite",
        "uploads": STATIC_UPLOADS_PATH,
    }


@app.get("/health")
def health_check():
    return {"status": "ok"}
