from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from sqlalchemy.orm import Session
from src.schemas import EvidenceCreate, EvidenceResponse
from src.models import Evidence
from src.services.db_service import get_db
from src.services.s3_service import upload_to_s3
import uuid
from datetime import datetime

router = APIRouter()

@router.post("/", response_model=EvidenceResponse)
async def create_evidence(evidence: EvidenceCreate, db: Session = Depends(get_db)):
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
    db.commit()
    db.refresh(db_evidence)
    return db_evidence

@router.post("/upload-screenshot/")
async def upload_screenshot(
    scenario_id: str,
    step_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload screenshot to S3 and log to DB"""
    contents = await file.read()
    
    # Generate S3 key
    s3_key = f"scenarios/{scenario_id}/step_{step_id}/{uuid.uuid4()}.png"
    
    # Upload to S3
    s3_url = await upload_to_s3(s3_key, contents, file.content_type)
    
    # Log to database
    evidence = Evidence(
        scenario_id=scenario_id,
        step_id=step_id,
        type="screenshot",
        location=s3_key,
        context={"url": s3_url, "uploaded_at": datetime.now().isoformat()}
    )
    db.add(evidence)
    db.commit()
    
    return {
        "status": "uploaded",
        "s3_key": s3_key,
        "url": s3_url,
        "evidence_id": evidence.id
    }

@router.get("/scenario/{scenario_id}")
async def get_scenario_evidence(scenario_id: str, db: Session = Depends(get_db)):
    """Get all evidence for a scenario, grouped by type"""
    evidence = db.query(Evidence).filter(Evidence.scenario_id == scenario_id).all()
    
    grouped = {}
    for ev in evidence:
        if ev.type not in grouped:
            grouped[ev.type] = []
        grouped[ev.type].append({
            "id": ev.id,
            "step_id": ev.step_id,
            "timestamp": ev.timestamp.isoformat(),
            "location": ev.location
        })
    
    return {"scenario_id": scenario_id, "evidence": grouped}