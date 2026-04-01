from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.question_groups import router as question_groups_router
from app.api.surveys import router as surveys_router
from app.config import settings

app = FastAPI(
    title="Survey Tool API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router, prefix="/api/v1")
app.include_router(surveys_router, prefix="/api/v1")
app.include_router(question_groups_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    return {"status": "ok"}
