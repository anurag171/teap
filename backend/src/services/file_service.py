import os
import aiofiles

# Directory where evidence images will be saved
EVIDENCE_DIR = os.getenv("EVIDENCE_DIR", "/var/teap/evidence")

# Ensure the root folder exists on startup
os.makedirs(EVIDENCE_DIR, exist_ok=True)

async def save_to_filestore(relative_path: str, file_bytes: bytes) -> str:
    """
    Saves image bytes directly to disk/filestore.
    """
    # Full destination path
    full_path = os.path.join(EVIDENCE_DIR, relative_path)
    
    # Automatically create subdirectories if they don't exist
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    
    # Save the file asynchronously
    async with aiofiles.open(full_path, "wb") as f:
        await f.write(file_bytes)
        
    return full_path