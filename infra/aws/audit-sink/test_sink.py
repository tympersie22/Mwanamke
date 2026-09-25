import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, patch


class ClientError(Exception):
    def __init__(self, status):
        self.response = {"ResponseMetadata": {"HTTPStatusCode": status}}


class AuditSinkTests(unittest.TestCase):
    def setUp(self):
        self.s3 = Mock()
        self.s3.exceptions = types.SimpleNamespace(ClientError=ClientError)
        sdk = types.SimpleNamespace(client=lambda _: self.s3)
        with patch.dict(sys.modules, {"boto3": sdk}):
            spec = importlib.util.spec_from_file_location("audit_sink", Path(__file__).with_name("sink.py"))
            self.sink = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.sink)
        self.environment = patch.dict(os.environ, {
            "TOKEN_SHA256": hashlib.sha256(b"test-token").hexdigest(),
            "AUDIT_BUCKET": "test-audit", "RETENTION_DAYS": "365",
            "OBJECT_LOCK_MODE": "COMPLIANCE", "AUDIT_KMS_KEY_ARN": "test-key"
        })
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.payload = {"auditEventId": "12345678-1234-4123-8123-123456789abc", "eventHash": "A" * 43 + "=", "previousHash": None,
                        "actorRef": "opaque-actor", "action": "appointment.confirmed", "targetRef": None, "occurredAt": "2026-09-25T10:00:00.000Z"}

    def event(self):
        return {"headers": {"authorization": "Bearer test-token"}, "body": json.dumps(self.payload)}

    def test_rejects_invalid_auth_before_storage(self):
        event = self.event()
        event["headers"] = {}
        self.assertEqual(self.sink.handler(event, None)["statusCode"], 401)
        self.s3.put_object.assert_not_called()

    def test_rejects_extra_health_payload(self):
        self.payload["clinicalNote"] = "must never be exported"
        self.assertEqual(self.sink.handler(self.event(), None)["statusCode"], 422)
        self.s3.put_object.assert_not_called()

    def test_retention_encryption_and_atomic_insert(self):
        self.assertEqual(self.sink.handler(self.event(), None)["statusCode"], 201)
        args = self.s3.put_object.call_args.kwargs
        self.assertEqual(args["IfNoneMatch"], "*")
        self.assertEqual(args["ObjectLockMode"], "COMPLIANCE")
        self.assertEqual(args["SSEKMSKeyId"], "test-key")
        self.assertEqual(json.loads(args["Body"]), self.payload)

    def test_duplicate_is_idempotent_and_other_storage_errors_propagate(self):
        self.s3.put_object.side_effect = ClientError(412)
        self.assertEqual(self.sink.handler(self.event(), None)["statusCode"], 200)
        self.s3.put_object.side_effect = ClientError(403)
        with self.assertRaises(ClientError):
            self.sink.handler(self.event(), None)


if __name__ == "__main__":
    unittest.main()
