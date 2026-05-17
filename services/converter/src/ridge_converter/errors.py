from __future__ import annotations

from fastapi import HTTPException


class ConverterError(Exception):
    def __init__(self, code: str, message: str, http_status: int, details: dict[str, object] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status
        self.details = details


def error_body(code: str, message: str, details: dict[str, object] | None = None) -> dict[str, object]:
    payload: dict[str, object] = {"code": code, "message": message}
    if details:
        payload["details"] = details
    return {"error": payload}


def http_error(code: str, message: str, status_code: int, details: dict[str, object] | None = None) -> HTTPException:
    return HTTPException(status_code=status_code, detail=error_body(code, message, details))
