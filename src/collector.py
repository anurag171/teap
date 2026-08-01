import os
import json
import uuid
import base64
import aiofiles
from datetime import datetime
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.services.db_service import get_db
from src.models import Evidence, EvidenceType, Scenario, Step

router = APIRouter()

# Directory for storing screenshots (Filestore / Local Mount)
EVIDENCE_DIR = os.getenv("EVIDENCE_DIR", "/var/teap/evidence")
os.makedirs(EVIDENCE_DIR, exist_ok=True)


class EvidenceCollector:
    """Core logic to process and persist different evidence types to DB and Filestore."""

    def __init__(self, db: Session):
        self.db = db

    async def save_file_to_filestore(self, relative_path: str, file_bytes: bytes) -> str:
        """Saves binary data directly to disk/filestore."""
        full_path = os.path.join(EVIDENCE_DIR, relative_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

        async with aiofiles.open(full_path, "wb") as f:
            await f.write(file_bytes)

        return full_path

    async def capture_screenshot(
        self,
        scenario_id: str,
        step_id: Optional[int],
        image_bytes: bytes,
        context: Optional[Dict[str, Any]] = None
    ) -> Evidence:
        """Captures a UI screenshot: saves image to Filestore and logs record in DB."""
        timestamp = datetime.utcnow()
        file_uuid = uuid.uuid4()
        
        # Structure relative storage path: scenarios/{scenario_id}/step_{step_id}/{uuid}.png
        step_folder = f"step_{step_id}" if step_id else "general"
        relative_path = f"scenarios/{scenario_id}/{step_folder}/{file_uuid}.png"

        # 1. Save file to disk/filestore
        await self.save_file_to_filestore(relative_path, image_bytes)

        # 2. Construct static serving URL
        static_url = f"/static/{relative_path}"
        evidence_context = context or {}
        evidence_context.update({
            "url": static_url,
            "captured_at": timestamp.isoformat()
        })

        # 3. Create database record
        evidence = Evidence(
            id=str(file_uuid),
            scenario_id=scenario_id,
            step_id=step_id,
            type=EvidenceType.SCREENSHOT,
            location=relative_path,
            context=evidence_context,
            timestamp=timestamp
        )
        self.db.add(evidence)
        self.db.commit()
        self.db.refresh(evidence)
        return evidence

    async def capture_db_query(
        self,
        scenario_id: str,
        step_id: Optional[int],
        query: str,
        params: Optional[List[Any]] = None,
        result: Optional[List[Dict[str, Any]]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> Evidence:
        """Captures DB query execution metadata and result sets."""
        timestamp = datetime.utcnow()
        content = {
            "query": query,
            "parameters": params or [],
            "result": result or [],
            "row_count": len(result) if result else 0
        }

        evidence = Evidence(
            scenario_id=scenario_id,
            step_id=step_id,
            type=EvidenceType.DB_QUERY,
            content=content,
            context=context or {},
            timestamp=timestamp
        )
        self.db.add(evidence)
        self.db.commit()
        self.db.refresh(evidence)
        return evidence

    async def capture_payment_event(
        self,
        scenario_id: str,
        step_id: Optional[int],
        payment_data: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> Evidence:
        """Captures payment transaction payloads (Stripe, PayPal, etc.)."""
        timestamp = datetime.utcnow()
        payment_record = {
            "transaction_id": payment_data.get("id") or payment_data.get("transaction_id"),
            "amount": payment_data.get("amount"),
            "currency": payment_data.get("currency"),
            "status": payment_data.get("status"),
            "payment_method": payment_data.get("payment_method"),
            "timestamp": timestamp.isoformat(),
            "payload": payment_data
        }

        evidence = Evidence(
            scenario_id=scenario_id,
            step_id=step_id,
            type=EvidenceType.PAYMENT_EVENT,
            content=payment_record,
            context=context or {},
            timestamp=timestamp
        )
        self.db.add(evidence)
        self.db.commit()
        self.db.refresh(evidence)
        return evidence


# =====================================================================
# REST ENDPOINTS
# =====================================================================

@router.post("/screenshot")
async def collect_screenshot(
    scenario_id: str = Form(...),
    step_id: Optional[int] = Form(None),
    context: Optional[str] = Form("{}"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Multipart REST endpoint to upload screenshots directly from tests."""
    collector = EvidenceCollector(db)
    image_bytes = await file.read()
    
    try:
        parsed_context = json.loads(context)
    except json.JSONDecodeError:
        parsed_context = {}

    evidence = await collector.capture_screenshot(
        scenario_id=scenario_id,
        step_id=step_id,
        image_bytes=image_bytes,
        context=parsed_context
    )
    
    return {
        "status": "success",
        "evidence_id": evidence.id,
        "location": evidence.location,
        "url": evidence.context.get("url")
    }


# =====================================================================
# WEBSOCKET ENDPOINT FOR REAL-TIME TEST RUNNERS
# =====================================================================

@router.websocket("/ws/collect/{scenario_id}")
async def websocket_collector(websocket: WebSocket, scenario_id: str, db: Session = Depends(get_db)):
    """
    WebSocket endpoint accepting JSON streams from active test runs.
    Accepts evidence types: 'screenshot' (base64 string), 'db_query', 'payment'.
    """
    await websocket.accept()
    collector = EvidenceCollector(db)

    try:
        while True:
            data = await websocket.receive_json()
            evidence_type = data.get("type")
            step_id = data.get("step_id")
            context = data.get("context", {})

            if evidence_type == "screenshot":
                # Expects 'image' as a base64 encoded string
                raw_b64 = data.get("image", "")
                if "," in raw_b64:
                    raw_b64 = raw_b64.split(",")[1]
                
                image_bytes = base64.b64decode(raw_b64)
                evidence = await collector.capture_screenshot(
                    scenario_id=scenario_id,
                    step_id=step_id,
                    image_bytes=image_bytes,
                    context=context
                )
                await websocket.send_json({
                    "status": "ok",
                    "evidence_id": evidence.id,
                    "type": "screenshot",
                    "url": evidence.context.get("url")
                })

            elif evidence_type == "db_query":
                evidence = await collector.capture_db_query(
                    scenario_id=scenario_id,
                    step_id=step_id,
                    query=data.get("query", ""),
                    params=data.get("params", []),
                    result=data.get("result", []),
                    context=context
                )
                await websocket.send_json({
                    "status": "ok",
                    "evidence_id": evidence.id,
                    "type": "db_query"
                })

            elif evidence_type == "payment":
                evidence = await collector.capture_payment_event(
                    scenario_id=scenario_id,
                    step_id=step_id,
                    payment_data=data.get("payment_data", {}),
                    context=context
                )
                await websocket.send_json({
                    "status": "ok",
                    "evidence_id": evidence.id,
                    "type": "payment_event"
                })

            else:
                await websocket.send_json({
                    "status": "error",
                    "message": f"Unsupported evidence type: {evidence_type}"
                })

    except WebSocketDisconnect:
        print(f"WebSocket client disconnected for scenario: {scenario_id}")
    except Exception as e:
        await websocket.send_json({"status": "error", "message": str(e)})
        await websocket.close()