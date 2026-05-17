from __future__ import annotations

from datetime import UTC, datetime
import threading
import uuid

from .models import ConversionJob, ConversionTask, ErrorDetail, UsageInfo


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class JobStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._jobs: dict[str, ConversionJob] = {}
        self._idempotency: dict[tuple[str, str], str] = {}

    def create(self, api_key: str, task: ConversionTask, client_job_id: str | None, metadata: dict[str, object] | None) -> ConversionJob:
        with self._lock:
            if client_job_id:
                existing = self._idempotency.get((api_key, client_job_id))
                if existing:
                    return self._jobs[existing]
            job = ConversionJob(
                jobId=f"conv_{uuid.uuid4().hex}",
                status="queued",
                task=task,
                createdAt=now_iso(),
                clientJobId=client_job_id,
                metadata=metadata,
            )
            self._jobs[job.jobId] = job
            if client_job_id:
                self._idempotency[(api_key, client_job_id)] = job.jobId
            return job

    def get(self, job_id: str) -> ConversionJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def start(self, job_id: str) -> ConversionJob | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job or job.status != "queued":
                return job
            job.status = "running"
            job.startedAt = now_iso()
            return job

    def succeed(self, job_id: str, *, artifacts: list, result: dict[str, object], warnings: list[str] | None, duration: float) -> ConversionJob:
        with self._lock:
            job = self._jobs[job_id]
            job.status = "succeeded"
            job.completedAt = now_iso()
            job.artifacts = artifacts
            job.result = result
            job.warnings = warnings or None
            job.usage = UsageInfo(durationSeconds=duration)
            return job

    def fail(self, job_id: str, code: str, message: str, details: dict[str, object] | None = None) -> ConversionJob:
        with self._lock:
            job = self._jobs[job_id]
            job.status = "failed"
            job.completedAt = now_iso()
            job.error = ErrorDetail(code=code, message=message, details=details)
            return job

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
            if job.status in {"succeeded", "failed", "canceled"}:
                return False
            job.status = "canceled"
            job.completedAt = now_iso()
            return True
