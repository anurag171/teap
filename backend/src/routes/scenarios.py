from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from src.schemas import ScenarioCreate, ScenarioResponse
from src.models import Scenario, Evidence
from src.services.db_service import get_db
from typing import List

router = APIRouter()

@router.post("/", response_model=ScenarioResponse)
async def create_scenario(scenario: ScenarioCreate, db: Session = Depends(get_db)):
    """Create a new test scenario"""
    db_scenario = Scenario(
        name=scenario.name,
        description=scenario.description,
        metadata=scenario.metadata
    )
    db.add(db_scenario)
    db.commit()
    db.refresh(db_scenario)
    return db_scenario

@router.get("/", response_model=List[ScenarioResponse])
async def list_scenarios(db: Session = Depends(get_db)):
    """List all scenarios with evidence count"""
    scenarios = db.query(Scenario).all()
    
    result = []
    for scenario in scenarios:
        evidence_count = db.query(func.count(Evidence.id)).filter(
            Evidence.scenario_id == scenario.id
        ).scalar()
        
        result.append({
            **scenario.__dict__,
            'evidence_count': evidence_count
        })
    
    return result

@router.get("/{scenario_id}", response_model=ScenarioResponse)
async def get_scenario(scenario_id: str, db: Session = Depends(get_db)):
    """Get specific scenario with details"""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    evidence_count = db.query(func.count(Evidence.id)).filter(
        Evidence.scenario_id == scenario_id
    ).scalar()
    
    return {
        **scenario.__dict__,
        'evidence_count': evidence_count
    }

@router.put("/{scenario_id}")
async def update_scenario_status(scenario_id: str, status: str, db: Session = Depends(get_db)):
    """Mark scenario as completed"""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    scenario.status = status
    db.commit()
    return {"status": "updated"}