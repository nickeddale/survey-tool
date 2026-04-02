"""Validators for special question types: ranking, image_picker, file_upload (settings), expression, html."""

from app.utils.errors import UnprocessableError


# ---------------------------------------------------------------------------
# ranking
# ---------------------------------------------------------------------------


def validate_ranking_settings(settings: dict | None, answer_options: list) -> None:
    """Validate settings for ranking questions.

    Requires at least one answer_option.
    Optional fields: randomize_initial_order (bool).
    """
    if not answer_options:
        raise UnprocessableError("ranking question requires at least one answer option")

    if settings is None:
        return

    if "randomize_initial_order" in settings and not isinstance(
        settings["randomize_initial_order"], bool
    ):
        raise UnprocessableError("settings.randomize_initial_order must be a boolean")


def validate_ranking_answer(answer: dict, question, answer_options: list) -> None:
    """Validate a submitted answer for a ranking question.

    answer: {"values": [str, ...]}  — ordered list of all option codes exactly once.
    """
    option_codes = [opt.code for opt in answer_options]
    option_code_set = set(option_codes)

    values = answer.get("values")

    if question.is_required and not values:
        raise UnprocessableError("An answer is required for this question")

    if not values:
        return

    if not isinstance(values, list):
        raise UnprocessableError("Ranking answer values must be a list")

    # Check for non-string entries
    for val in values:
        if not isinstance(val, str):
            raise UnprocessableError(
                f"Ranking answer values must be strings, got {type(val).__name__}"
            )

    # Check for unknown option codes
    submitted_set = set(values)
    unknown = submitted_set - option_code_set
    if unknown:
        raise UnprocessableError(
            f"Unknown option code(s) in ranking answer: {sorted(unknown)}"
        )

    # Check for duplicates
    if len(values) != len(submitted_set):
        raise UnprocessableError(
            "Ranking answer must not contain duplicate option codes"
        )

    # Check that every option is present
    missing = option_code_set - submitted_set
    if missing:
        raise UnprocessableError(
            f"Ranking answer is missing option code(s): {sorted(missing)}"
        )

    # Check that no extra options are present (already covered by unknown check above)
    # and that count matches
    if len(values) != len(option_codes):
        raise UnprocessableError(
            f"Ranking answer must contain exactly {len(option_codes)} option code(s), "
            f"got {len(values)}"
        )


# ---------------------------------------------------------------------------
# image_picker
# ---------------------------------------------------------------------------

_VALID_IMAGE_DIMENSIONS = (None,)  # image_width/height are optional positive ints


def validate_image_picker_settings(settings: dict | None, answer_options: list) -> None:
    """Validate settings for image_picker questions.

    Requires at least one answer_option.
    Each answer_option should have an image_url (validated separately at option creation time).
    Optional fields: multi_select (bool), min_choices (int >= 1), max_choices (int >= min_choices),
    image_width (int > 0), image_height (int > 0), show_labels (bool).
    """
    if not answer_options:
        raise UnprocessableError("image_picker question requires at least one answer option")

    if settings is None:
        return

    if "multi_select" in settings and not isinstance(settings["multi_select"], bool):
        raise UnprocessableError("settings.multi_select must be a boolean")

    if "show_labels" in settings and not isinstance(settings["show_labels"], bool):
        raise UnprocessableError("settings.show_labels must be a boolean")

    if "image_width" in settings:
        w = settings["image_width"]
        if not isinstance(w, int) or w <= 0:
            raise UnprocessableError("settings.image_width must be a positive integer")

    if "image_height" in settings:
        h = settings["image_height"]
        if not isinstance(h, int) or h <= 0:
            raise UnprocessableError("settings.image_height must be a positive integer")

    min_choices = settings.get("min_choices")
    max_choices = settings.get("max_choices")

    if min_choices is not None:
        if not isinstance(min_choices, int) or min_choices < 1:
            raise UnprocessableError("settings.min_choices must be an integer >= 1")
        if min_choices > len(answer_options):
            raise UnprocessableError(
                f"settings.min_choices ({min_choices}) exceeds the number of answer options "
                f"({len(answer_options)})"
            )

    if max_choices is not None:
        if not isinstance(max_choices, int) or max_choices < 1:
            raise UnprocessableError("settings.max_choices must be an integer >= 1")
        if min_choices is not None and max_choices < min_choices:
            raise UnprocessableError("settings.max_choices must be >= settings.min_choices")


def validate_image_picker_answer(answer: dict, question, answer_options: list) -> None:
    """Validate a submitted answer for an image_picker question.

    Single-select: answer {"value": str | None}
    Multi-select:  answer {"values": [str, ...]}
    Behaviour mirrors choice validators, keyed on settings.multi_select.
    """
    settings = question.settings or {}
    multi_select = settings.get("multi_select", False)
    min_choices = settings.get("min_choices")
    max_choices = settings.get("max_choices")
    option_codes = {opt.code for opt in answer_options}

    if multi_select:
        values = answer.get("values", [])
        if not isinstance(values, list):
            raise UnprocessableError("image_picker answer values must be a list")

        if question.is_required and not values:
            raise UnprocessableError("At least one image must be selected for this question")

        for val in values:
            if val not in option_codes:
                raise UnprocessableError(f"'{val}' is not a valid answer option code")

        if min_choices is not None and len(values) < min_choices:
            raise UnprocessableError(f"At least {min_choices} image(s) must be selected")

        if max_choices is not None and len(values) > max_choices:
            raise UnprocessableError(f"No more than {max_choices} image(s) can be selected")
    else:
        value = answer.get("value")

        if question.is_required and not value:
            raise UnprocessableError("An image selection is required for this question")

        if value is None:
            return

        if value not in option_codes:
            raise UnprocessableError(f"'{value}' is not a valid answer option code")


# ---------------------------------------------------------------------------
# file_upload (settings only — answer validation handled by misc_validators)
# ---------------------------------------------------------------------------

_VALID_FILE_TYPES = frozenset({
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg",
    "mp4", "avi", "mov", "mp3", "wav",
    "zip", "tar", "gz", "csv", "txt", "json", "xml",
})


def validate_file_upload_settings(settings: dict | None) -> None:
    """Validate settings for file_upload questions.

    Optional fields:
    - allowed_types: list of strings (e.g. ['pdf', 'jpg', 'png'])
    - max_file_size_mb: number > 0
    - max_files: int >= 1
    """
    if settings is None:
        return

    if "allowed_types" in settings:
        allowed_types = settings["allowed_types"]
        if not isinstance(allowed_types, list):
            raise UnprocessableError("settings.allowed_types must be a list")
        for t in allowed_types:
            if not isinstance(t, str):
                raise UnprocessableError(
                    "settings.allowed_types must be a list of strings"
                )
            if t.lower() not in _VALID_FILE_TYPES:
                raise UnprocessableError(
                    f"'{t}' is not a supported file type in settings.allowed_types"
                )

    if "max_file_size_mb" in settings:
        size = settings["max_file_size_mb"]
        if not isinstance(size, (int, float)) or isinstance(size, bool) or size <= 0:
            raise UnprocessableError(
                "settings.max_file_size_mb must be a positive number"
            )

    if "max_files" in settings:
        max_files = settings["max_files"]
        if not isinstance(max_files, int) or isinstance(max_files, bool) or max_files < 1:
            raise UnprocessableError("settings.max_files must be an integer >= 1")


# ---------------------------------------------------------------------------
# expression
# ---------------------------------------------------------------------------


def validate_expression_settings(settings: dict | None) -> None:
    """Validate settings for expression (computed value) questions.

    Optional fields: expression (str), display_format (str).
    No answer validator — expression questions are computed, not user-submitted.
    """
    if settings is None:
        return

    if "expression" in settings and not isinstance(settings["expression"], str):
        raise UnprocessableError("settings.expression must be a string")

    if "display_format" in settings and not isinstance(settings["display_format"], str):
        raise UnprocessableError("settings.display_format must be a string")


# ---------------------------------------------------------------------------
# html
# ---------------------------------------------------------------------------


def validate_html_settings(settings: dict | None) -> None:
    """Validate settings for html (static content block) questions.

    Optional fields: content (str — HTML markup).
    No answer validator — html questions accept no user input.
    """
    if settings is None:
        return

    if "content" in settings and not isinstance(settings["content"], str):
        raise UnprocessableError("settings.content must be a string")
