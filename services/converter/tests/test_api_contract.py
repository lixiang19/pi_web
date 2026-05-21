import base64
import json
from pathlib import Path
from types import SimpleNamespace

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


def test_public_bind_rejects_default_development_api_key() -> None:
    try:
        create_app(
            ConverterSettings(
                host="0.0.0.0",
                api_keys=("dev-key",),
                public_base_url="https://converter.example/v1",
            )
        )
    except RuntimeError as exc:
        assert "RIDGE_CONVERTER_API_KEYS must be explicitly configured" in str(exc)
    else:
        raise AssertionError("public converter app must reject default dev-key")


def test_public_bind_accepts_explicit_api_key() -> None:
    app = create_app(
        ConverterSettings(
            host="0.0.0.0",
            api_keys=("prod-secret",),
            public_base_url="https://converter.example/v1",
        )
    )
    client = TestClient(app)

    response = client.get("/v1/health", headers={"Authorization": "Bearer prod-secret"})

    assert response.status_code == 200


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


def test_url_html_without_extension_is_named_for_markitdown(monkeypatch) -> None:
    calls: list[str] = []

    class FakeResult:
        markdown = "# URL HTML"

    class FakeMarkItDown:
        def __init__(self, **kwargs) -> None:
            self.kwargs = kwargs

        def convert(self, path: str) -> FakeResult:
            calls.append(Path(path).suffix)
            return FakeResult()

    class FakeResponse:
        status_code = 200
        content = b"<html><body><h1>URL HTML</h1></body></html>"
        headers = {"content-type": "text/html; charset=utf-8"}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def get(self, url: str) -> FakeResponse:
            assert url == "https://example.com/article"
            return FakeResponse()

    monkeypatch.setattr("socket.getaddrinfo", lambda *args, **kwargs: [(None, None, None, None, ("93.184.216.34", 443))])
    monkeypatch.setattr("httpx.AsyncClient", FakeAsyncClient)
    monkeypatch.setattr("markitdown.MarkItDown", FakeMarkItDown)
    client = make_client()

    response = client.post(
        "/v1/conversions",
        headers=auth_headers(),
        json={
            "task": "document.markdown",
            "input": {"url": "https://example.com/article"},
            "waitMs": 30000,
        },
    )

    assert response.status_code == 202
    assert response.json()["status"] == "succeeded"
    assert response.json()["artifacts"][0]["name"] == "article.md"
    assert calls == [".html"]


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


def test_image_and_audio_tasks_can_explicitly_use_markitdown_fallback(monkeypatch) -> None:
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
            data={"task": task, "waitMs": "30000", "options": json.dumps({"engine": "markitdown"})},
            files={"file": (filename, b"fake bytes", mime_type)},
        )

        assert response.status_code == 202
        artifacts = {artifact["name"]: artifact for artifact in response.json()["artifacts"]}
        metadata_artifact = next(artifact for name, artifact in artifacts.items() if name.endswith(".metadata.json"))
        metadata = json.loads(metadata_artifact["content"])
        assert metadata["engine"] == "markitdown"

    assert calls == [".png", ".jpg", ".mp3"]


def test_image_ocr_uses_configured_vision_model_by_default(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    class FakeChatCompletions:
        def create(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(content="HELLO RIDGE\n123"),
                    )
                ]
            )

    class FakeOpenAI:
        def __init__(self, *, api_key: str, base_url: str | None = None) -> None:
            calls.append({"api_key": api_key, "base_url": base_url})
            self.chat = SimpleNamespace(completions=FakeChatCompletions())

    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)
    app = create_app(
        ConverterSettings(
            api_keys=("test-key",),
            public_base_url="http://testserver/v1",
            run_jobs_inline=True,
            vision_api_key="vision-key",
            vision_base_url="https://vision.example/v1",
            vision_model="vision-model-1",
        )
    )
    client = TestClient(app)

    response = client.post(
        "/v1/conversions",
        headers=auth_headers(),
        data={"task": "image.ocr", "waitMs": "30000"},
        files={"file": ("scan.png", b"fake png bytes", "image/png")},
    )

    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "succeeded"
    artifacts = {artifact["name"]: artifact for artifact in body["artifacts"]}
    assert artifacts["scan.md"]["content"] == "HELLO RIDGE\n123"
    metadata = json.loads(artifacts["scan.metadata.json"]["content"])
    assert metadata["engine"] == "vision-ocr"
    assert metadata["model"] == "vision-model-1"
    assert metadata["baseUrl"] == "https://vision.example/v1"
    assert calls[0] == {"api_key": "vision-key", "base_url": "https://vision.example/v1"}
    assert calls[1]["model"] == "vision-model-1"


def test_audio_transcription_uses_groq_by_default(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    class FakeResponse:
        status_code = 200
        text = json.dumps({"text": "hello ridge"})

        def json(self):
            return {
                "text": "hello ridge",
                "language": "en",
                "duration": 1.25,
                "segments": [
                    {"id": 0, "start": 0.0, "end": 1.25, "text": "hello ridge", "avg_logprob": -0.1}
                ],
            }

    class FakeHttpClient:
        def __init__(self, *args, **kwargs) -> None:
            calls.append({"init": kwargs})

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def post(self, url: str, *, headers: dict[str, str], data: dict[str, str], files: dict[str, tuple[str, bytes, str]]):
            calls.append({"url": url, "headers": headers, "data": data, "files": files})
            return FakeResponse()

    monkeypatch.setattr("httpx.Client", FakeHttpClient)
    app = create_app(
        ConverterSettings(
            api_keys=("test-key",),
            public_base_url="http://testserver/v1",
            run_jobs_inline=True,
            groq_api_key="groq-key",
            groq_base_url="https://api.groq.test/openai/v1",
            groq_audio_model="whisper-large-v3-turbo",
        )
    )
    client = TestClient(app)

    response = client.post(
        "/v1/conversions",
        headers=auth_headers(),
        data={"task": "audio.transcription", "waitMs": "30000"},
        files={"file": ("voice.wav", b"fake wav bytes", "audio/wav")},
    )

    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "succeeded"
    artifacts = {artifact["name"]: artifact for artifact in body["artifacts"]}
    assert artifacts["voice.md"]["content"] == "[00:00.000 - 00:01.250] hello ridge"
    segments = json.loads(artifacts["voice.segments.json"]["content"])
    assert segments[0]["text"] == "hello ridge"
    metadata = json.loads(artifacts["voice.metadata.json"]["content"])
    assert metadata["engine"] == "groq"
    assert metadata["model"] == "whisper-large-v3-turbo"
    assert metadata["language"] == "en"
    request = calls[1]
    assert request["url"] == "https://api.groq.test/openai/v1/audio/transcriptions"
    assert request["headers"]["Authorization"] == "Bearer groq-key"
    assert request["data"]["response_format"] == "verbose_json"
    assert request["files"]["file"] == ("voice.wav", b"fake wav bytes", "audio/wav")


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
