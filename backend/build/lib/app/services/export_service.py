"""Backward-compatibility shim for export_service.

The original 833-line module has been split into focused submodules under
services/exporters/. This shim re-exports all public symbols so that existing
callers (api/surveys.py, api/responses.py, tests/test_export.py) require no changes.

Do not add new logic here — add it to the appropriate submodule instead.
"""
from app.services.exporters.survey_export_service import (
    clone_survey,
    export_survey,
    import_survey,
)
from app.services.exporters.response_export_service import (
    get_responses_for_export,
)
from app.services.exporters.csv_exporter import (
    build_csv_headers,
    flatten_response_to_csv_row,
    generate_csv_stream,
)
from app.services.exporters.json_exporter import (
    build_json_export,
)

__all__ = [
    "clone_survey",
    "export_survey",
    "import_survey",
    "get_responses_for_export",
    "build_csv_headers",
    "flatten_response_to_csv_row",
    "generate_csv_stream",
    "build_json_export",
]
