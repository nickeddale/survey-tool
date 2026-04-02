"""Tests for special question type validators: ranking, image_picker, file_upload (settings), expression, html."""

import pytest
from unittest.mock import MagicMock

from app.services.validators.special_validators import (
    validate_ranking_settings,
    validate_ranking_answer,
    validate_image_picker_settings,
    validate_image_picker_answer,
    validate_file_upload_settings,
    validate_expression_settings,
    validate_html_settings,
)
from app.services.validators import validate_question_config, validate_answer
from app.utils.errors import UnprocessableError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_option(code: str):
    opt = MagicMock()
    opt.code = code
    return opt


def make_question(
    question_type: str = "ranking",
    is_required: bool = False,
    settings: dict | None = None,
    validation: dict | None = None,
):
    q = MagicMock()
    q.question_type = question_type
    q.is_required = is_required
    q.settings = settings
    q.validation = validation
    return q


# ===========================================================================
# ranking — settings
# ===========================================================================


def test_ranking_settings_valid_with_options():
    options = [make_option("A"), make_option("B"), make_option("C")]
    validate_ranking_settings(None, options)  # no exception


def test_ranking_settings_no_options_raises():
    with pytest.raises(UnprocessableError, match="at least one answer option"):
        validate_ranking_settings(None, [])


def test_ranking_settings_valid_randomize():
    options = [make_option("A"), make_option("B")]
    validate_ranking_settings({"randomize_initial_order": True}, options)


def test_ranking_settings_invalid_randomize_not_bool():
    options = [make_option("A")]
    with pytest.raises(UnprocessableError, match="randomize_initial_order must be a boolean"):
        validate_ranking_settings({"randomize_initial_order": "yes"}, options)


def test_ranking_settings_none_settings_valid():
    options = [make_option("A")]
    validate_ranking_settings(None, options)  # no exception


# ===========================================================================
# ranking — answer
# ===========================================================================


def test_ranking_answer_valid_all_options():
    options = [make_option("A"), make_option("B"), make_option("C")]
    q = make_question(question_type="ranking")
    validate_ranking_answer({"values": ["C", "A", "B"]}, q, options)


def test_ranking_answer_single_option_valid():
    options = [make_option("X")]
    q = make_question(question_type="ranking")
    validate_ranking_answer({"values": ["X"]}, q, options)


def test_ranking_answer_empty_not_required():
    options = [make_option("A"), make_option("B")]
    q = make_question(question_type="ranking", is_required=False)
    validate_ranking_answer({"values": []}, q, options)


def test_ranking_answer_empty_required_raises():
    options = [make_option("A"), make_option("B")]
    q = make_question(question_type="ranking", is_required=True)
    with pytest.raises(UnprocessableError, match="required"):
        validate_ranking_answer({"values": []}, q, options)


def test_ranking_answer_missing_option_raises():
    options = [make_option("A"), make_option("B"), make_option("C")]
    q = make_question(question_type="ranking")
    with pytest.raises(UnprocessableError, match="missing option code"):
        validate_ranking_answer({"values": ["A", "B"]}, q, options)


def test_ranking_answer_duplicate_option_raises():
    options = [make_option("A"), make_option("B"), make_option("C")]
    q = make_question(question_type="ranking")
    with pytest.raises(UnprocessableError, match="duplicate"):
        validate_ranking_answer({"values": ["A", "A", "C"]}, q, options)


def test_ranking_answer_unknown_option_raises():
    options = [make_option("A"), make_option("B")]
    q = make_question(question_type="ranking")
    with pytest.raises(UnprocessableError, match="Unknown option code"):
        validate_ranking_answer({"values": ["A", "UNKNOWN"]}, q, options)


def test_ranking_answer_extra_unknown_option_raises():
    options = [make_option("A"), make_option("B")]
    q = make_question(question_type="ranking")
    with pytest.raises(UnprocessableError, match="Unknown option code"):
        validate_ranking_answer({"values": ["A", "B", "C"]}, q, options)


def test_ranking_answer_not_a_list_raises():
    options = [make_option("A"), make_option("B")]
    q = make_question(question_type="ranking")
    with pytest.raises(UnprocessableError, match="must be a list"):
        validate_ranking_answer({"values": "A"}, q, options)


def test_ranking_answer_non_string_entry_raises():
    options = [make_option("A"), make_option("B")]
    q = make_question(question_type="ranking")
    with pytest.raises(UnprocessableError, match="must be strings"):
        validate_ranking_answer({"values": ["A", 2]}, q, options)


# ===========================================================================
# image_picker — settings
# ===========================================================================


def test_image_picker_settings_valid_with_options():
    options = [make_option("IMG1"), make_option("IMG2")]
    validate_image_picker_settings(None, options)


def test_image_picker_settings_no_options_raises():
    with pytest.raises(UnprocessableError, match="at least one answer option"):
        validate_image_picker_settings(None, [])


def test_image_picker_settings_all_valid():
    options = [make_option("IMG1"), make_option("IMG2"), make_option("IMG3")]
    settings = {
        "multi_select": True,
        "min_choices": 1,
        "max_choices": 3,
        "image_width": 200,
        "image_height": 150,
        "show_labels": True,
    }
    validate_image_picker_settings(settings, options)


def test_image_picker_settings_invalid_multi_select():
    options = [make_option("IMG1")]
    with pytest.raises(UnprocessableError, match="multi_select must be a boolean"):
        validate_image_picker_settings({"multi_select": "yes"}, options)


def test_image_picker_settings_invalid_show_labels():
    options = [make_option("IMG1")]
    with pytest.raises(UnprocessableError, match="show_labels must be a boolean"):
        validate_image_picker_settings({"show_labels": 1}, options)


def test_image_picker_settings_invalid_image_width_zero():
    options = [make_option("IMG1")]
    with pytest.raises(UnprocessableError, match="image_width must be a positive integer"):
        validate_image_picker_settings({"image_width": 0}, options)


def test_image_picker_settings_invalid_image_width_negative():
    options = [make_option("IMG1")]
    with pytest.raises(UnprocessableError, match="image_width must be a positive integer"):
        validate_image_picker_settings({"image_width": -100}, options)


def test_image_picker_settings_invalid_image_width_string():
    options = [make_option("IMG1")]
    with pytest.raises(UnprocessableError, match="image_width must be a positive integer"):
        validate_image_picker_settings({"image_width": "200"}, options)


def test_image_picker_settings_invalid_image_height():
    options = [make_option("IMG1")]
    with pytest.raises(UnprocessableError, match="image_height must be a positive integer"):
        validate_image_picker_settings({"image_height": 0}, options)


def test_image_picker_settings_min_choices_exceeds_options():
    options = [make_option("IMG1"), make_option("IMG2")]
    with pytest.raises(UnprocessableError, match="min_choices.*exceeds the number"):
        validate_image_picker_settings({"min_choices": 3}, options)


def test_image_picker_settings_min_choices_zero_raises():
    options = [make_option("IMG1")]
    with pytest.raises(UnprocessableError, match="min_choices must be an integer >= 1"):
        validate_image_picker_settings({"min_choices": 0}, options)


def test_image_picker_settings_max_choices_less_than_min_raises():
    options = [make_option("IMG1"), make_option("IMG2"), make_option("IMG3")]
    with pytest.raises(UnprocessableError, match="max_choices must be >= settings.min_choices"):
        validate_image_picker_settings({"min_choices": 3, "max_choices": 1}, options)


def test_image_picker_settings_max_choices_zero_raises():
    options = [make_option("IMG1")]
    with pytest.raises(UnprocessableError, match="max_choices must be an integer >= 1"):
        validate_image_picker_settings({"max_choices": 0}, options)


# ===========================================================================
# image_picker — answer (single-select mode)
# ===========================================================================


def test_image_picker_single_answer_valid():
    options = [make_option("IMG1"), make_option("IMG2")]
    q = make_question(question_type="image_picker", settings={"multi_select": False})
    validate_image_picker_answer({"value": "IMG1"}, q, options)


def test_image_picker_single_answer_null_not_required():
    options = [make_option("IMG1")]
    q = make_question(question_type="image_picker", is_required=False, settings={})
    validate_image_picker_answer({"value": None}, q, options)


def test_image_picker_single_answer_null_required_raises():
    options = [make_option("IMG1")]
    q = make_question(question_type="image_picker", is_required=True, settings={})
    with pytest.raises(UnprocessableError, match="required"):
        validate_image_picker_answer({"value": None}, q, options)


def test_image_picker_single_answer_invalid_code_raises():
    options = [make_option("IMG1")]
    q = make_question(question_type="image_picker", settings={})
    with pytest.raises(UnprocessableError, match="not a valid answer option code"):
        validate_image_picker_answer({"value": "NOPE"}, q, options)


# ===========================================================================
# image_picker — answer (multi-select mode)
# ===========================================================================


def test_image_picker_multi_answer_valid():
    options = [make_option("IMG1"), make_option("IMG2"), make_option("IMG3")]
    q = make_question(
        question_type="image_picker",
        settings={"multi_select": True, "min_choices": 1, "max_choices": 2},
    )
    validate_image_picker_answer({"values": ["IMG1", "IMG2"]}, q, options)


def test_image_picker_multi_answer_empty_not_required():
    options = [make_option("IMG1")]
    q = make_question(
        question_type="image_picker",
        is_required=False,
        settings={"multi_select": True},
    )
    validate_image_picker_answer({"values": []}, q, options)


def test_image_picker_multi_answer_empty_required_raises():
    options = [make_option("IMG1")]
    q = make_question(
        question_type="image_picker",
        is_required=True,
        settings={"multi_select": True},
    )
    with pytest.raises(UnprocessableError, match="At least one image must be selected"):
        validate_image_picker_answer({"values": []}, q, options)


def test_image_picker_multi_answer_invalid_code_raises():
    options = [make_option("IMG1")]
    q = make_question(
        question_type="image_picker",
        settings={"multi_select": True},
    )
    with pytest.raises(UnprocessableError, match="not a valid answer option code"):
        validate_image_picker_answer({"values": ["NOPE"]}, q, options)


def test_image_picker_multi_answer_below_min_raises():
    options = [make_option("IMG1"), make_option("IMG2"), make_option("IMG3")]
    q = make_question(
        question_type="image_picker",
        settings={"multi_select": True, "min_choices": 2},
    )
    with pytest.raises(UnprocessableError, match="At least 2 image"):
        validate_image_picker_answer({"values": ["IMG1"]}, q, options)


def test_image_picker_multi_answer_above_max_raises():
    options = [make_option("IMG1"), make_option("IMG2"), make_option("IMG3")]
    q = make_question(
        question_type="image_picker",
        settings={"multi_select": True, "max_choices": 2},
    )
    with pytest.raises(UnprocessableError, match="No more than 2 image"):
        validate_image_picker_answer({"values": ["IMG1", "IMG2", "IMG3"]}, q, options)


def test_image_picker_multi_answer_not_list_raises():
    options = [make_option("IMG1")]
    q = make_question(
        question_type="image_picker",
        settings={"multi_select": True},
    )
    with pytest.raises(UnprocessableError, match="must be a list"):
        validate_image_picker_answer({"values": "IMG1"}, q, options)


# ===========================================================================
# file_upload — settings
# ===========================================================================


def test_file_upload_settings_none_valid():
    validate_file_upload_settings(None)


def test_file_upload_settings_empty_valid():
    validate_file_upload_settings({})


def test_file_upload_settings_valid_all_fields():
    validate_file_upload_settings({
        "allowed_types": ["pdf", "jpg", "png"],
        "max_file_size_mb": 10,
        "max_files": 5,
    })


def test_file_upload_settings_allowed_types_not_list_raises():
    with pytest.raises(UnprocessableError, match="allowed_types must be a list"):
        validate_file_upload_settings({"allowed_types": "pdf"})


def test_file_upload_settings_allowed_types_non_string_entry_raises():
    with pytest.raises(UnprocessableError, match="list of strings"):
        validate_file_upload_settings({"allowed_types": [123]})


def test_file_upload_settings_allowed_types_invalid_type_raises():
    with pytest.raises(UnprocessableError, match="not a supported file type"):
        validate_file_upload_settings({"allowed_types": ["exe"]})


def test_file_upload_settings_max_file_size_mb_zero_raises():
    with pytest.raises(UnprocessableError, match="max_file_size_mb must be a positive number"):
        validate_file_upload_settings({"max_file_size_mb": 0})


def test_file_upload_settings_max_file_size_mb_negative_raises():
    with pytest.raises(UnprocessableError, match="max_file_size_mb must be a positive number"):
        validate_file_upload_settings({"max_file_size_mb": -5})


def test_file_upload_settings_max_file_size_mb_bool_raises():
    with pytest.raises(UnprocessableError, match="max_file_size_mb must be a positive number"):
        validate_file_upload_settings({"max_file_size_mb": True})


def test_file_upload_settings_max_file_size_mb_float_valid():
    validate_file_upload_settings({"max_file_size_mb": 2.5})


def test_file_upload_settings_max_files_zero_raises():
    with pytest.raises(UnprocessableError, match="max_files must be an integer >= 1"):
        validate_file_upload_settings({"max_files": 0})


def test_file_upload_settings_max_files_string_raises():
    with pytest.raises(UnprocessableError, match="max_files must be an integer >= 1"):
        validate_file_upload_settings({"max_files": "5"})


def test_file_upload_settings_max_files_bool_raises():
    with pytest.raises(UnprocessableError, match="max_files must be an integer >= 1"):
        validate_file_upload_settings({"max_files": True})


def test_file_upload_settings_max_files_valid():
    validate_file_upload_settings({"max_files": 1})
    validate_file_upload_settings({"max_files": 10})


# ===========================================================================
# expression — settings
# ===========================================================================


def test_expression_settings_none_valid():
    validate_expression_settings(None)


def test_expression_settings_empty_valid():
    validate_expression_settings({})


def test_expression_settings_valid():
    validate_expression_settings({
        "expression": "{Q1} + {Q2}",
        "display_format": "%.2f",
    })


def test_expression_settings_invalid_expression_not_string():
    with pytest.raises(UnprocessableError, match="expression must be a string"):
        validate_expression_settings({"expression": 42})


def test_expression_settings_invalid_display_format_not_string():
    with pytest.raises(UnprocessableError, match="display_format must be a string"):
        validate_expression_settings({"display_format": ["%.2f"]})


# ===========================================================================
# html — settings
# ===========================================================================


def test_html_settings_none_valid():
    validate_html_settings(None)


def test_html_settings_empty_valid():
    validate_html_settings({})


def test_html_settings_valid():
    validate_html_settings({"content": "<p>Welcome to the survey!</p>"})


def test_html_settings_invalid_content_not_string():
    with pytest.raises(UnprocessableError, match="content must be a string"):
        validate_html_settings({"content": 123})


def test_html_settings_content_empty_string_valid():
    validate_html_settings({"content": ""})


# ===========================================================================
# Integration: validate_question_config dispatcher
# ===========================================================================


def test_dispatcher_ranking_config_with_options():
    options = [make_option("A"), make_option("B")]
    errors = validate_question_config(
        question_type="ranking",
        settings={"randomize_initial_order": True},
        validation=None,
        answer_options=options,
    )
    assert errors == []


def test_dispatcher_ranking_config_no_options_returns_error():
    errors = validate_question_config(
        question_type="ranking",
        settings={"randomize_initial_order": True},
        validation=None,
        answer_options=[],
    )
    assert len(errors) == 1
    assert "answer option" in errors[0].message


def test_dispatcher_image_picker_config_with_options():
    options = [make_option("IMG1")]
    errors = validate_question_config(
        question_type="image_picker",
        settings={"multi_select": False},
        validation=None,
        answer_options=options,
    )
    assert errors == []


def test_dispatcher_file_upload_config_valid():
    errors = validate_question_config(
        question_type="file_upload",
        settings={"allowed_types": ["pdf", "png"], "max_files": 3},
        validation=None,
    )
    assert errors == []


def test_dispatcher_file_upload_config_invalid_type():
    errors = validate_question_config(
        question_type="file_upload",
        settings={"allowed_types": ["exe"]},
        validation=None,
    )
    assert len(errors) == 1
    assert "supported file type" in errors[0].message


def test_dispatcher_expression_config_valid():
    errors = validate_question_config(
        question_type="expression",
        settings={"expression": "{Q1}*2", "display_format": "%.0f"},
        validation=None,
    )
    assert errors == []


def test_dispatcher_html_config_valid():
    errors = validate_question_config(
        question_type="html",
        settings={"content": "<h2>Section</h2>"},
        validation=None,
    )
    assert errors == []


def test_dispatcher_expression_no_settings_skips_validation():
    """Config validation is skipped when settings is None."""
    errors = validate_question_config(
        question_type="expression",
        settings=None,
        validation=None,
    )
    assert errors == []


def test_dispatcher_html_no_settings_skips_validation():
    errors = validate_question_config(
        question_type="html",
        settings=None,
        validation=None,
    )
    assert errors == []


# ===========================================================================
# Integration: validate_answer dispatcher
# ===========================================================================


def test_dispatcher_ranking_answer_valid():
    options = [make_option("A"), make_option("B"), make_option("C")]
    q = make_question(question_type="ranking")
    errors = validate_answer({"values": ["B", "C", "A"]}, q, answer_options=options)
    assert errors == []


def test_dispatcher_ranking_answer_missing_option_returns_error():
    options = [make_option("A"), make_option("B"), make_option("C")]
    q = make_question(question_type="ranking")
    errors = validate_answer({"values": ["A", "B"]}, q, answer_options=options)
    assert len(errors) == 1


def test_dispatcher_image_picker_answer_valid_single():
    options = [make_option("IMG1"), make_option("IMG2")]
    q = make_question(question_type="image_picker", settings={"multi_select": False})
    errors = validate_answer({"value": "IMG1"}, q, answer_options=options)
    assert errors == []


def test_dispatcher_expression_answer_returns_no_errors():
    """expression has no answer validator — any answer is treated as valid (no-op)."""
    q = make_question(question_type="expression")
    errors = validate_answer({"value": "42"}, q)
    assert errors == []


def test_dispatcher_html_answer_returns_no_errors():
    """html has no answer validator — any answer is treated as valid (no-op)."""
    q = make_question(question_type="html")
    errors = validate_answer({"value": "anything"}, q)
    assert errors == []


# ===========================================================================
# Registry integrity checks
# ===========================================================================


def test_ranking_in_config_validators():
    from app.services.validators import _CONFIG_VALIDATORS
    assert "ranking" in _CONFIG_VALIDATORS


def test_image_picker_in_config_validators():
    from app.services.validators import _CONFIG_VALIDATORS
    assert "image_picker" in _CONFIG_VALIDATORS


def test_file_upload_in_config_validators():
    from app.services.validators import _CONFIG_VALIDATORS
    assert "file_upload" in _CONFIG_VALIDATORS


def test_expression_in_config_validators():
    from app.services.validators import _CONFIG_VALIDATORS
    assert "expression" in _CONFIG_VALIDATORS


def test_html_in_config_validators():
    from app.services.validators import _CONFIG_VALIDATORS
    assert "html" in _CONFIG_VALIDATORS


def test_ranking_in_answer_validators():
    from app.services.validators import _ANSWER_VALIDATORS
    assert "ranking" in _ANSWER_VALIDATORS


def test_image_picker_in_answer_validators():
    from app.services.validators import _ANSWER_VALIDATORS
    assert "image_picker" in _ANSWER_VALIDATORS


def test_expression_not_in_answer_validators():
    from app.services.validators import _ANSWER_VALIDATORS
    assert "expression" not in _ANSWER_VALIDATORS


def test_html_not_in_answer_validators():
    from app.services.validators import _ANSWER_VALIDATORS
    assert "html" not in _ANSWER_VALIDATORS
