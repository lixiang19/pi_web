import base64
import json
from pathlib import Path

from fastapi.testclient import TestClient

from ridge_converter.app import create_app
from ridge_converter.config import ConverterSettings


def make_client() -> TestClient:
    app = create_app(
        ConverterSettings(
            api_keys=("test-key",),
            public_base_url="http://testserver/v1",
            run_jobs_inline=True,
        )
    )
    return TestClient(app)


def auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer test-key"}


def test_authentication_is_required() -> None:
    client = make_client()

    response = client.get("/v1/capabilities")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "auth_failed"


def test_capabilities_advertise_all_ridge_conversion_tasks() -> None:
    client = make_client()

    response = client.get("/v1/capabilities", headers=auth_headers())

    assert response.status_code == 200
    body = response.json()
    tasks = {task["task"] for task in body["tasks"]}
    assert {
        "document.markdown",
        "audio.transcription",
        "image.ocr",
        "image.description",
        "document.ocr_markdown",
    }.issubset(tasks)


def test_document_markdown_conversion_accepts_ridge_multipart_contract() -> None:
    client = make_client()

    response = client.post(
        "/v1/conversions",
        headers=auth_headers(),
        data={
            "task": "document.markdown",
            "clientJobId": "ridge-note-1",
            "waitMs": "30000",
            "metadata": json.dumps({"ridgeFileId": "notes/note.txt"}),
        },
        files={"file": ("note.txt", b"hello ridge\n\nsecond line", "text/plain")},
    )

    assert response.status_code == 202
    job = response.json()
    assert job["status"] == "succeeded"
    assert job["clientJobId"] == "ridge-note-1"
    artifacts = {artifact["name"]: artifact for artifact in job["artifacts"]}
    assert artifacts["note.md"]["content"] == "hello ridge\n\nsecond line"
    metadata = json.loads(artifacts["note.metadata.json"]["content"])
    assert metadata["sourceType"] == "txt"
    assert metadata["engine"] == "markitdown"

    artifact_response = client.get(
        f"/v1/conversions/{job['jobId']}/artifacts/{artifacts['note.md']['artifactId']}",
        headers=auth_headers(),
    )
    assert artifact_response.status_code == 200
    assert artifact_response.text == "hello ridge\n\nsecond line"


def test_client_job_id_is_idempotent_per_api_key() -> None:
    client = make_client()
    payload = {
        "task": "document.markdown",
        "input": {
            "base64": "data:text/plain;base64,"
            + base64.b64encode(b"same input").decode("ascii"),
            "mimeType": "text/plain",
        },
        "clientJobId": "ridge-idempotent",
        "waitMs": 30000,
    }

    first = client.post("/v1/conversions", headers=auth_headers(), json=payload)
    second = client.post("/v1/conversions", headers=auth_headers(), json=payload)

    assert first.status_code == 202
    assert second.status_code == 202
    assert second.json()["jobId"] == first.json()["jobId"]


def test_local_file_paths_are_rejected_in_json_input() -> None:
    client = make_client()

    response = client.post(
        "/v1/conversions",
        headers=auth_headers(),
        json={
            "task": "document.markdown",
            "input": {"url": "file:///etc/passwd"},
            "waitMs": 30000,
        },
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_input"


def test_cancel_marks_queued_or_running_job_canceled() -> None:
    app = create_app(
        ConverterSettings(
            api_keys=("test-key",),
            public_base_url="http://testserver/v1",
            run_jobs_inline=False,
            start_background_jobs=False,
        )
    )
    client = TestClient(app)

    created = client.post(
        "/v1/conversions",
        headers=auth_headers(),
        json={
            "task": "document.markdown",
            "input": {
                "base64": "data:text/plain;base64,"
                + base64.b64encode(b"queued").decode("ascii"),
                "mimeType": "text/plain",
            },
        },
    )
    job_id = created.json()["jobId"]

    canceled = client.post(f"/v1/conversions/{job_id}/cancel", headers=auth_headers())
    fetched = client.get(f"/v1/conversions/{job_id}", headers=auth_headers())

    assert canceled.status_code == 204
    assert fetched.json()["status"] == "canceled"


def test_image_and_audio_tasks_use_markitdown_as_the_primary_engine(monkeypatch) -> None:
    calls: list[str] = []

    class FakeResult:
        markdown = "converted by markitdown"

    class FakeMarkItDown:
        def __init__(self, **kwargs) -> None:
            self.kwargs = kwargs

        def convert(self, path: str) -> FakeResult:
            calls.append(Path(path).suffix)
            return FakeResult()

    monkeypatch.setattr("markitdown.MarkItDown", FakeMarkItDown)
    client = make_client()

    for task, filename, mime_type in [
        ("image.ocr", "scan.png", "image/png"),
        ("image.description", "photo.jpg", "image/jpeg"),
        ("audio.transcription", "voice.mp3", "audio/mpeg"),
    ]:
        response = client.post(
            "/v1/conversions",
            headers=auth_headers(),
            data={"task": task, "waitMs": "30000"},
            files={"file": (filename, b"fake bytes", mime_type)},
        )

        assert response.status_code == 202
        artifacts = {artifact["name"]: artifact for artifact in response.json()["artifacts"]}
        metadata_artifact = next(artifact for name, artifact in artifacts.items() if name.endswith(".metadata.json"))
        metadata = json.loads(metadata_artifact["content"])
        assert metadata["engine"] == "markitdown"

    assert calls == [".png", ".jpg", ".mp3"]


def test_base64_pdf_keeps_document_extension_for_markitdown(monkeypatch) -> None:
    calls: list[str] = []

    class FakeResult:
        markdown = "# PDF"

    class FakeMarkItDown:
        def __init__(self, **kwargs) -> None:
            self.kwargs = kwargs

        def convert(self, path: str) -> FakeResult:
            calls.append(Path(path).suffix)
            return FakeResult()

    monkeypatch.setattr("markitdown.MarkItDown", FakeMarkItDown)
    client = make_client()

    response = client.post(
        "/v1/conversions",
        headers=auth_headers(),
        json={
            "task": "document.markdown",
            "input": {
                "base64": "data:application/pdf;base64,"
                + base64.b64encode(b"%PDF fake").decode("ascii"),
                "mimeType": "application/pdf",
            },
            "waitMs": 30000,
        },
    )

    assert response.status_code == 202
    metadata_artifact = next(
        artifact for artifact in response.json()["artifacts"] if artifact["name"].endswith(".metadata.json")
    )
    metadata = json.loads(metadata_artifact["content"])
    assert metadata["sourceType"] == "pdf"
    assert calls == [".pdf"]
