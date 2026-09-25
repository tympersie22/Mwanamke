import base64
import datetime
import hashlib
import hmac
import json
import os
import re

import boto3

s3 = boto3.client("s3")
UUID = re.compile(r"^[0-9a-fA-F-]{36}$")
HASH = re.compile(r"^[A-Za-z0-9+/]{43}=$")
ALLOWED = {"auditEventId", "eventHash", "actorRef", "action", "targetRef", "occurredAt", "previousHash"}

def response(status, body):
    return {"statusCode": status, "headers": {"content-type": "application/json", "cache-control": "no-store"}, "body": json.dumps(body)}

def handler(event, _context):
    supplied = (event.get("headers") or {}).get("authorization", "")
    token = supplied[7:] if supplied.startswith("Bearer ") else ""
    if not token or not hmac.compare_digest(hashlib.sha256(token.encode()).hexdigest(), os.environ["TOKEN_SHA256"]):
        return response(401, {"error": "AUTHENTICATION_REQUIRED"})
    try:
        body = event.get("body") or ""
        if event.get("isBase64Encoded"):
            body = base64.b64decode(body).decode()
        if len(body.encode()) > 32768:
            return response(413, {"error": "EVENT_TOO_LARGE"})
        payload = json.loads(body)
    except (ValueError, UnicodeDecodeError):
        return response(422, {"error": "INVALID_EVENT"})
    if not isinstance(payload, dict) or set(payload) != ALLOWED or not UUID.fullmatch(str(payload.get("auditEventId", ""))):
        return response(422, {"error": "INVALID_EVENT"})
    if not all(isinstance(payload.get(field), str) and 0 < len(payload[field]) <= limit for field, limit in {"actorRef": 200, "action": 120, "occurredAt": 40}.items()):
        return response(422, {"error": "INVALID_EVENT"})
    if payload["targetRef"] is not None and (not isinstance(payload["targetRef"], str) or len(payload["targetRef"]) > 200):
        return response(422, {"error": "INVALID_EVENT"})
    if not isinstance(payload["eventHash"], str) or not HASH.fullmatch(payload["eventHash"]):
        return response(422, {"error": "INVALID_EVENT"})
    if payload["previousHash"] is not None and (not isinstance(payload["previousHash"], str) or not HASH.fullmatch(payload["previousHash"])):
        return response(422, {"error": "INVALID_EVENT"})
    event_id = payload["auditEventId"]
    key = f"events/{event_id[:2]}/{event_id}.json"
    retain_until = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=int(os.environ["RETENTION_DAYS"]))
    encoded = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    try:
        s3.put_object(Bucket=os.environ["AUDIT_BUCKET"], Key=key, Body=encoded, ContentType="application/json", ServerSideEncryption="aws:kms", SSEKMSKeyId=os.environ["AUDIT_KMS_KEY_ARN"], ObjectLockMode=os.environ["OBJECT_LOCK_MODE"], ObjectLockRetainUntilDate=retain_until, ChecksumSHA256=base64.b64encode(hashlib.sha256(encoded).digest()).decode(), IfNoneMatch="*")
    except s3.exceptions.ClientError as error:
        if error.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 412:
            return response(200, {"status": "already-stored", "id": event_id})
        raise
    return response(201, {"status": "stored", "id": event_id})
