from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ConversionTask = Literal[
    "document.markdown",
    "audio.transcription",
    "image.ocr",
    "image.description",
    "document.ocr_markdown",
]

JobStatus = Literal["queued", "running", "succeeded", "failed", "canceled"]


class ConversionInput(BaseModel):
    url: str | None = None
    base64: str | None = None
    mimeType: str | None = None


class ConversionRequest(BaseModel):
    task: ConversionTask
    input: ConversionInput | None = None
    options: dict[str, object] | None = None
    clientJobId: str | None = None
    callbackUrl: str | None = None
    metadata: dict[str, object] | None = None
    preferredFormat: Literal["markdown", "json", "text", "html"] | None = None
    waitMs: int | None = Field(default=None, ge=0, le=30_000)


class Artifact(BaseModel):
    artifactId: str
    name: str
    mimeType: str
    size: int
    inline: bool
    content: str | None = None
    downloadUrl: str | None = None


class UsageInfo(BaseModel):
    durationSeconds: float | None = None
    model: str | None = None
    credits: float | None = None


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict[str, object] | None = None


class ConversionJob(BaseModel):
    jobId: str
    status: JobStatus
    task: ConversionTask
    createdAt: str
    startedAt: str | None = None
    completedAt: str | None = None
    clientJobId: str | None = None
    metadata: dict[str, object] | None = None
    result: dict[str, object] | None = None
    artifacts: list[Artifact] | None = None
    usage: UsageInfo | None = None
    warnings: list[str] | None = None
    error: ErrorDetail | None = None


class CapabilityTask(BaseModel):
    task: ConversionTask
    supportedInputFormats: list[str]
    supportedOutputFormats: list[str]
    optionsSchema: dict[str, object]


class CapabilitiesResponse(BaseModel):
    version: str
    tasks: list[CapabilityTask]
    maxFileSizeBytes: int
    maxInlineSizeBytes: int
    defaultRetentionDays: int = 7


class SourceFile(BaseModel):
    filename: str
    mime_type: str
    data: bytes

    model_config = ConfigDict(arbitrary_types_allowed=True)


class ConvertedArtifact(BaseModel):
    name: str
    mime_type: str
    data: bytes

    model_config = ConfigDict(arbitrary_types_allowed=True)
