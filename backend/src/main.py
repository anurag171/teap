"""
TEAP Backend - Complete FastAPI Implementation
Production-ready with all endpoints, models, and services
"""

import os
import json
from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, String, DateTime, Enum, Integer, JSON, ForeignKey, func, create_engine, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from sqlalchemy.dialects.postgresql import UUID
import uuid as uuid_module
import enum
import boto3
from dotenv import load_dotenv
from pydantic import BaseModel, Field
import logging

# ============================================================================
# CONFIGURATION & SETUP
# ============================================================================

load_dotenv()

logger = logging.getLogger(__name__)

# Dynamic Database Configuration based on DB_TYPE env var
# Supported values: 'pg' | 'oracle' | 'sqlite' (default)
DB_TYPE = os.getenv("DB_TYPE", "sqlite").lower()

if DB_TYPE == "pg":
    DEFAULT_DB_URL = "postgresql+asyncpg://teap:teap@localhost:5432/teap"
elif DB_TYPE == "oracle":
    DEFAULT_DB_URL = "oracle+oracledb://teap:teap@localhost:1521/?service_name=orcl"
else:
    # Default fallback to SQLite
    DEFAULT_DB_URL = "sqlite+aiosqlite:///./teap.db"

DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DB_URL)

S3_BUCKET = os.getenv("S3_BUCKET", "teap-evidence")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "minioadmin")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "minioadmin")
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL", "http://localhost:9000")

# Database Engine Setup
engine_args = {"echo": False, "future": True}
if DATABASE_URL.startswith("sqlite"):
    engine_args["connect_args"] = {"check_same_thread": False}

engine = create_async_engine(DATABASE_URL, **engine_args)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

# S3 Client
s3_client = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    endpoint_url=S3_ENDPOINT_URL,
    region_name='us-east-1'
)

# FastAPI App
app = FastAPI(
    title="TEAP API",
    description="Test Evidence Automation Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# DATABASE MODELS
# ============================================================================

class ScenarioStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"

class EvidenceType(str, enum.Enum):
    SCREENSHOT = "screenshot"
    DB_QUERY = "db_query"
    PAYMENT_EVENT = "payment_event"
    API_CALL = "api_call"
    EMAIL_LOG = "email_log"
    NETWORK_LOG = "network_log"
    TIMESTAMP = "timestamp"

class Scenario(Base):
    __tablename__ = "scenarios"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid_module.uuid4()))
    name = Column(String(255), nullable=False, index=True)
    description = Column(String, nullable=True)
    status = Column(Enum(ScenarioStatus), default=ScenarioStatus.IN_PROGRESS)
    coverage = Column(Integer, default=0)  # Coverage percentage
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # 'metadata' name is reserved in SQLAlchemy Declarative; use extra_metadata attr
    extra_metadata = Column("metadata", JSON, nullable=True)
    
    # Relationships
    steps = relationship("Step", cascade="all, delete-orphan", back_populates="scenario")
    evidence_items = relationship("Evidence", cascade="all, delete-orphan", back_populates="scenario")

class Step(Base):
    __tablename__ = "steps"
    
    id = Column(Integer, primary_key=True)
    scenario_id = Column(String, ForeignKey("scenarios.id"), nullable=False, index=True)
    step_number = Column(Integer, nullable=False)
    description = Column(String, nullable=False)
    expected_result = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    scenario = relationship("Scenario", back_populates="steps")
    
    class Config:
        orm_mode = True

class Evidence(Base):
    __tablename__ = "evidence"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid_module.uuid4()))
    scenario_id = Column(String, ForeignKey("scenarios.id"), nullable=False, index=True)
    step_id = Column(Integer, nullable=True)
    type = Column(Enum(EvidenceType), nullable=False, index=True)
    location = Column(String(1024), nullable=True)  # S3 key for files
    content = Column(JSON, nullable=True)  # Structured data
    context = Column(JSON, nullable=True)  # Metadata
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    scenario = relationship("Scenario", back_populates="evidence_items")
    
    class Config:
        orm_mode = True

class Report(Base):
    __tablename__ = "reports"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid_module.uuid4()))
    scenario_id = Column(String, ForeignKey("scenarios.id"), nullable=True)
    format = Column(String(10), nullable=False)  # 'pdf', 'html', 'json'
    location = Column(String(1024), nullable=True)  # S3 key
    summary = Column(String, nullable=True)  # AI summary
    evidence_count = Column(Integer, default=0)
    generated_by = Column(String(255), nullable=True)
    generated_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    class Config:
        orm_mode = True

class AuditLog(Base):
    __tablename__ = "audit_log"
    
    id = Column(Integer, primary_key=True)
    scenario_id = Column(String, nullable=True, index=True)
    action = Column(String(100), nullable=False)
    details = Column(JSON, nullable=True)
    user_id = Column(String(255), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    
    class Config:
        orm_mode = True

# ============================================================================
# PYDANTIC SCHEMAS
# ============================================================================

class StepCreate(BaseModel):
    step_number: int
    description: str
    expected_result: Optional[str] = None

class StepResponse(BaseModel):
    id: int
    scenario_id: str
    step_number: int
    description: str
    expected_result: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True

class ScenarioCreate(BaseModel):
    name: str
    description: Optional[str] = None
    extra_metadata: Optional[dict] = Field(None, alias="metadata")

    model_config = {"populate_by_name": True}

class ScenarioUpdate(BaseModel):
    status: Optional[str] = None
    coverage: Optional[int] = None

class ScenarioResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    status: str
    coverage: int
    evidence_count: int = 0
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class EvidenceCreate(BaseModel):
    scenario_id: str
    step_id: Optional[int] = None
    type: str
    location: Optional[str] = None
    content: Optional[dict] = None
    context: Optional[dict] = None

class EvidenceResponse(BaseModel):
    id: str
    scenario_id: str
    step_id: Optional[int]
    type: str
    location: Optional[str]
    timestamp: datetime
    
    class Config:
        from_attributes = True

class ReportCreate(BaseModel):
    scenario_ids: List[str]
    format: str = "pdf"
    include_screenshots: bool = True
    include_db_queries: bool = True
    include_payments: bool = True
    include_api_calls: bool = True
    include_ai_summary: bool = True
    include_audit_trail: bool = False

class ReportResponse(BaseModel):
    id: str
    format: str
    location: Optional[str]
    summary: Optional[str]
    evidence_count: int
    generated_at: datetime
    
    class Config:
        from_attributes = True

# ============================================================================
# DATABASE SESSION & DEPENDENCY
# ============================================================================

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database initialized")

async def get_db() -> AsyncSession:
    async with async_session_maker() as session:
        yield session

# ============================================================================
# SERVICE LAYER
# ============================================================================

class S3Service:
    """Handle S3 file uploads and storage"""
    
    @staticmethod
    async def upload_file(key: str, body: bytes, content_type: str = 'application/octet-stream') -> str:
        """Upload file to S3"""
        try:
            s3_client.put_object(
                Bucket=S3_BUCKET,
                Key=key,
                Body=body,
                ContentType=content_type
            )
            url = f"{S3_ENDPOINT_URL}/{S3_BUCKET}/{key}"
            logger.info(f"Uploaded to S3: {key}")
            return url
        except Exception as e:
            logger.exception(f"S3 upload failed: {e}")
            raise
    
    @staticmethod
    async def delete_file(key: str) -> bool:
        """Delete file from S3"""
        try:
            s3_client.delete_object(Bucket=S3_BUCKET, Key=key)
            return True
        except Exception as e:
            logger.exception(f"S3 delete failed: {e}")
            return False

class EvidenceCollector:
    """Collect and store evidence from tests"""
    
    @staticmethod
    async def capture_screenshot(
        db: AsyncSession,
        scenario_id: str,
        step_id: int,
        image_data: bytes,
        context: dict = None
    ) -> Evidence:
        """Capture and store screenshot"""
        key = f"scenarios/{scenario_id}/step_{step_id}/{datetime.now().isoformat()}.png"
        
        # Upload to S3
        s3_url = await S3Service.upload_file(key, image_data, 'image/png')
        
        # Store in database
        evidence = Evidence(
            scenario_id=scenario_id,
            step_id=step_id,
            type=EvidenceType.SCREENSHOT,
            location=key,
            context=context or {}
        )
        db.add(evidence)
        await db.commit()
        await db.refresh(evidence)
        
        logger.info(f"Screenshot captured: {scenario_id}/step_{step_id}")
        return evidence
    
    @staticmethod
    async def capture_db_query(
        db: AsyncSession,
        scenario_id: str,
        step_id: int,
        query: str,
        params: list,
        result: list
    ) -> Evidence:
        """Capture database query and results"""
        content = {
            'query': query,
            'parameters': params,
            'result': result,
            'row_count': len(result),
            'timestamp': datetime.now().isoformat()
        }
        
        evidence = Evidence(
            scenario_id=scenario_id,
            step_id=step_id,
            type=EvidenceType.DB_QUERY,
            content=content
        )
        db.add(evidence)
        await db.commit()
        await db.refresh(evidence)
        
        logger.info(f"DB query captured: {scenario_id}/step_{step_id} ({len(result)} rows)")
        return evidence
    
    @staticmethod
    async def capture_payment_event(
        db: AsyncSession,
        scenario_id: str,
        step_id: int,
        payment_data: dict
    ) -> Evidence:
        """Capture payment transaction event"""
        content = {
            'transaction_id': payment_data.get('id'),
            'amount': payment_data.get('amount'),
            'currency': payment_data.get('currency'),
            'status': payment_data.get('status'),
            'payment_method': payment_data.get('payment_method'),
            'timestamp': datetime.now().isoformat(),
            'full_response': payment_data
        }
        
        evidence = Evidence(
            scenario_id=scenario_id,
            step_id=step_id,
            type=EvidenceType.PAYMENT_EVENT,
            content=content
        )
        db.add(evidence)
        await db.commit()
        await db.refresh(evidence)
        
        logger.info(f"Payment event captured: {scenario_id} (tx: {payment_data.get('id')})")
        return evidence

class ReportService:
    """Generate test reports"""
    
    @staticmethod
    async def generate_report(
        db: AsyncSession,
        scenario_ids: List[str],
        report_format: str = 'pdf',
        include_options: dict = None
    ) -> Report:
        """Generate report from scenario evidence"""
        if include_options is None:
            include_options = {}
        
        # Fetch scenarios
        query = select(Scenario).where(Scenario.id.in_(scenario_ids))
        result = await db.execute(query)
        scenarios = result.scalars().all()
        
        # Fetch all evidence
        evidence_query = select(Evidence).where(Evidence.scenario_id.in_(scenario_ids))
        evidence_result = await db.execute(evidence_query)
        all_evidence = evidence_result.scalars().all()
        
        # Build report content
        report_content = {
            'scenarios': [
                {
                    'id': s.id,
                    'name': s.name,
                    'status': s.status,
                    'evidence_count': len([e for e in all_evidence if e.scenario_id == s.id])
                }
                for s in scenarios
            ],
            'evidence_summary': {
                'screenshot': len([e for e in all_evidence if e.type == EvidenceType.SCREENSHOT]),
                'db_query': len([e for e in all_evidence if e.type == EvidenceType.DB_QUERY]),
                'payment_event': len([e for e in all_evidence if e.type == EvidenceType.PAYMENT_EVENT]),
                'api_call': len([e for e in all_evidence if e.type == EvidenceType.API_CALL])
            },
            'generated_at': datetime.now().isoformat(),
            'include_options': include_options
        }
        
        # Store report
        report = Report(
            format=report_format,
            evidence_count=len(all_evidence),
            summary=f"Report with {len(all_evidence)} evidence items from {len(scenarios)} scenarios"
        )
        db.add(report)
        await db.commit()
        await db.refresh(report)
        
        logger.info(f"Report generated: {report.id} (format: {report_format})")
        return report

# ============================================================================
# WEBSOCKET CONNECTION MANAGER
# ============================================================================

class ConnectionManager:
    """Manage WebSocket connections for live evidence collection"""
    
    def __init__(self):
        self.active_connections: dict = {}
    
    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
    
    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
    
    async def broadcast(self, message: dict, client_id: str = None):
        if client_id and client_id in self.active_connections:
            await self.active_connections[client_id].send_json(message)

manager = ConnectionManager()

# ============================================================================
# ROUTE HANDLERS
# ============================================================================

# Health Check
@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "TEAP API"}

# Startup
@app.on_event("startup")
async def startup():
    await init_db()
    logger.info("TEAP API started")

# ============================================================================
# SCENARIO ROUTES
# ============================================================================

@app.post("/api/scenarios/", response_model=ScenarioResponse)
async def create_scenario(scenario: ScenarioCreate, db: AsyncSession = Depends(get_db)):
    """Create a new test scenario"""
    db_scenario = Scenario(
        name=scenario.name,
        description=scenario.description,
        extra_metadata=scenario.extra_metadata
    )
    db.add(db_scenario)
    await db.commit()
    await db.refresh(db_scenario)
    
    # Log audit
    audit = AuditLog(scenario_id=db_scenario.id, action="SCENARIO_CREATED", details={"name": scenario.name})
    db.add(audit)
    await db.commit()
    
    return db_scenario

@app.get("/api/scenarios/", response_model=List[ScenarioResponse])
async def list_scenarios(db: AsyncSession = Depends(get_db)):
    """List all scenarios with evidence count"""
    query = select(Scenario).order_by(Scenario.created_at.desc())
    result = await db.execute(query)
    scenarios = result.scalars().all()
    
    response = []
    for scenario in scenarios:
        evidence_query = select(func.count(Evidence.id)).where(Evidence.scenario_id == scenario.id)
        evidence_count_result = await db.execute(evidence_query)
        evidence_count = evidence_count_result.scalar() or 0
        
        scenario_dict = {
            'id': scenario.id,
            'name': scenario.name,
            'description': scenario.description,
            'status': scenario.status,
            'coverage': scenario.coverage,
            'evidence_count': evidence_count,
            'created_by': scenario.created_by,
            'created_at': scenario.created_at,
            'updated_at': scenario.updated_at
        }
        response.append(scenario_dict)
    
    return response

@app.get("/api/scenarios/{scenario_id}", response_model=ScenarioResponse)
async def get_scenario(scenario_id: str, db: AsyncSession = Depends(get_db)):
    """Get specific scenario"""
    query = select(Scenario).where(Scenario.id == scenario_id)
    result = await db.execute(query)
    scenario = result.scalar_one_or_none()
    
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    evidence_query = select(func.count(Evidence.id)).where(Evidence.scenario_id == scenario_id)
    evidence_count_result = await db.execute(evidence_query)
    evidence_count = evidence_count_result.scalar() or 0
    
    return {
        'id': scenario.id,
        'name': scenario.name,
        'description': scenario.description,
        'status': scenario.status,
        'coverage': scenario.coverage,
        'evidence_count': evidence_count,
        'created_by': scenario.created_by,
        'created_at': scenario.created_at,
        'updated_at': scenario.updated_at
    }

@app.put("/api/scenarios/{scenario_id}", response_model=ScenarioResponse)
async def update_scenario(scenario_id: str, update: ScenarioUpdate, db: AsyncSession = Depends(get_db)):
    """Update scenario"""
    query = select(Scenario).where(Scenario.id == scenario_id)
    result = await db.execute(query)
    scenario = result.scalar_one_or_none()
    
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    if update.status:
        scenario.status = update.status
    if update.coverage is not None:
        scenario.coverage = update.coverage
    
    scenario.updated_at = datetime.now()
    await db.commit()
    await db.refresh(scenario)
    
    # Log audit
    audit = AuditLog(scenario_id=scenario_id, action="SCENARIO_UPDATED")
    db.add(audit)
    await db.commit()
    
    return scenario

@app.delete("/api/scenarios/{scenario_id}")
async def delete_scenario(scenario_id: str, db: AsyncSession = Depends(get_db)):
    """Delete scenario"""
    query = select(Scenario).where(Scenario.id == scenario_id)
    result = await db.execute(query)
    scenario = result.scalar_one_or_none()
    
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    await db.delete(scenario)
    await db.commit()
    
    # Log audit
    audit = AuditLog(scenario_id=scenario_id, action="SCENARIO_DELETED")
    db.add(audit)
    await db.commit()
    
    return {"status": "deleted"}

# ============================================================================
# EVIDENCE ROUTES
# ============================================================================

@app.post("/api/evidence/", response_model=EvidenceResponse)
async def create_evidence(evidence: EvidenceCreate, db: AsyncSession = Depends(get_db)):
    """Log evidence item"""
    db_evidence = Evidence(
        scenario_id=evidence.scenario_id,
        step_id=evidence.step_id,
        type=evidence.type,
        location=evidence.location,
        content=evidence.content,
        context=evidence.context
    )
    db.add(db_evidence)
    await db.commit()
    await db.refresh(db_evidence)
    
    return db_evidence

@app.post("/api/evidence/upload-screenshot/")
async def upload_screenshot(
    scenario_id: str,
    step_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload screenshot"""
    contents = await file.read()
    
    evidence = await EvidenceCollector.capture_screenshot(
        db, scenario_id, step_id, contents,
        context={'original_filename': file.filename}
    )
    
    return {
        'status': 'uploaded',
        'evidence_id': evidence.id,
        'filename': file.filename
    }

@app.post("/api/evidence/db-query/")
async def capture_db_query(
    scenario_id: str,
    step_id: int,
    query: str,
    params: list = [],
    result: list = [],
    db: AsyncSession = Depends(get_db)
):
    """Capture database query"""
    evidence = await EvidenceCollector.capture_db_query(
        db, scenario_id, step_id, query, params, result
    )
    
    return {
        'status': 'captured',
        'evidence_id': evidence.id,
        'rows': len(result)
    }

@app.post("/api/evidence/payment/")
async def capture_payment(
    scenario_id: str,
    step_id: int,
    payment_data: dict,
    db: AsyncSession = Depends(get_db)
):
    """Capture payment event"""
    evidence = await EvidenceCollector.capture_payment_event(
        db, scenario_id, step_id, payment_data
    )
    
    return {
        'status': 'captured',
        'evidence_id': evidence.id,
        'transaction_id': payment_data.get('id')
    }

@app.get("/api/evidence/scenario/{scenario_id}")
async def get_scenario_evidence(scenario_id: str, db: AsyncSession = Depends(get_db)):
    """Get all evidence for a scenario"""
    query = select(Evidence).where(Evidence.scenario_id == scenario_id).order_by(Evidence.timestamp)
    result = await db.execute(query)
    evidence_items = result.scalars().all()
    
    grouped = {}
    for ev in evidence_items:
        ev_type = str(ev.type)
        if ev_type not in grouped:
            grouped[ev_type] = []
        
        grouped[ev_type].append({
            'id': ev.id,
            'step_id': ev.step_id,
            'timestamp': ev.timestamp.isoformat(),
            'location': ev.location
        })
    
    return {'scenario_id': scenario_id, 'evidence': grouped}

# ============================================================================
# REPORT ROUTES
# ============================================================================

@app.post("/api/reports/generate", response_model=ReportResponse)
async def generate_report(
    report_request: ReportCreate,
    db: AsyncSession = Depends(get_db)
):
    """Generate test report"""
    report = await ReportService.generate_report(
        db,
        report_request.scenario_ids,
        report_request.format,
        {
            'screenshots': report_request.include_screenshots,
            'db_queries': report_request.include_db_queries,
            'payments': report_request.include_payments,
            'api_calls': report_request.include_api_calls,
            'ai_summary': report_request.include_ai_summary,
            'audit_trail': report_request.include_audit_trail
        }
    )
    
    return report

@app.get("/api/reports/", response_model=List[ReportResponse])
async def list_reports(db: AsyncSession = Depends(get_db)):
    """List all reports"""
    query = select(Report).order_by(Report.generated_at.desc())
    result = await db.execute(query)
    reports = result.scalars().all()
    return reports

@app.get("/api/reports/{report_id}")
async def get_report(report_id: str, db: AsyncSession = Depends(get_db)):
    """Get specific report"""
    query = select(Report).where(Report.id == report_id)
    result = await db.execute(query)
    report = result.scalar_one_or_none()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    return report

# ============================================================================
# WEBSOCKET ENDPOINT FOR LIVE COLLECTION
# ============================================================================

@app.websocket("/ws/collect/{scenario_id}")
async def websocket_endpoint(websocket: WebSocket, scenario_id: str, db: AsyncSession = Depends(get_db)):
    """WebSocket for live evidence collection"""
    await manager.connect(websocket, scenario_id)
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if data['type'] == 'screenshot':
                import base64
                image_data = base64.b64decode(data['image'])
                await EvidenceCollector.capture_screenshot(
                    db, scenario_id, data['step_id'], image_data, data.get('context')
                )
            elif data['type'] == 'db_query':
                await EvidenceCollector.capture_db_query(
                    db, scenario_id, data['step_id'],
                    data['query'], data['params'], data['result']
                )
            elif data['type'] == 'payment':
                await EvidenceCollector.capture_payment_event(
                    db, scenario_id, data['step_id'], data['payment_data']
                )
            
            await manager.broadcast({'status': 'ok', 'type': data['type']}, scenario_id)
    
    except WebSocketDisconnect:
        manager.disconnect(scenario_id)
        logger.info(f"WebSocket disconnected: {scenario_id}")

# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("API_PORT", 8000)),
        reload=os.getenv("ENV") == "dev"
    )