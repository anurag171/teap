from sqlalchemy import Column, String, DateTime, Enum, Integer, JSON, ForeignKey, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from uuid import uuid4
from datetime import datetime
import enum

Base = declarative_base()

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

class Scenario(Base):
    __tablename__ = "scenarios"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    name = Column(String(255), nullable=False)
    description = Column(String, nullable=True)
    status = Column(Enum(ScenarioStatus), default=ScenarioStatus.IN_PROGRESS)
    created_by = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # Map 'scenario_metadata' in Python to 'metadata' column in Postgres
    scenario_metadata = Column("metadata", JSON, nullable=True)
    
    # Relationships
    steps = relationship("Step", cascade="all, delete-orphan")
    evidence = relationship("Evidence", cascade="all, delete-orphan")

class Step(Base):
    __tablename__ = "steps"
    
    id = Column(Integer, primary_key=True)
    scenario_id = Column(String, ForeignKey("scenarios.id"), nullable=False)
    step_number = Column(Integer, nullable=False)
    description = Column(String, nullable=False)
    expected_result = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Evidence(Base):
    __tablename__ = "evidence"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    scenario_id = Column(String, ForeignKey("scenarios.id"), nullable=False)
    step_id = Column(Integer, nullable=True)
    type = Column(Enum(EvidenceType), nullable=False)
    location = Column(String(1024), nullable=True)  # S3 key
    content = Column(JSON, nullable=True)  # For structured data
    context = Column(JSON, nullable=True)  # Browser state, env
    timestamp = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)