from __future__ import annotations

import uvicorn

from .app import create_app
from .config import ConverterSettings


def main() -> None:
    settings = ConverterSettings()
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
