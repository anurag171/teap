import boto3
import os
from botocore.client import Config

S3_ENDPOINT = os.getenv("S3_ENDPOINT_URL")
AWS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "minioadmin")
AWS_SECRET = os.getenv("AWS_SECRET_ACCESS_KEY", "minioadmin")
BUCKET_NAME = os.getenv("S3_BUCKET", "teap-evidence")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

s3_client = boto3.client(
    's3',
    endpoint_url=S3_ENDPOINT,
    aws_access_key_id=AWS_KEY,
    aws_secret_access_key=AWS_SECRET,
    region_name=AWS_REGION,
    config=Config(signature_version='s3v4')
)

def upload_to_s3(key: str, file_bytes: bytes, content_type: str) -> str:
    s3_client.put_object(
        Bucket=BUCKET_NAME,
        Key=key,
        Body=file_bytes,
        ContentType=content_type or 'image/png'
    )
    
    if S3_ENDPOINT:
        return f"{S3_ENDPOINT}/{BUCKET_NAME}/{key}"
    return f"https://{BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{key}"