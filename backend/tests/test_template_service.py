"""Unit tests for the template_service module.

Tests verify:
- Invitation template renders with all variables
- Reminder template renders with all variables
- Optional recipient_name defaults to 'there' when None/omitted
- Optional custom_message block is absent when not provided
- Optional custom_message appears in output when provided
- Missing required variables raise an error (not silent empty string)
- html_to_text strips HTML tags and produces readable plain text
- html_to_text handles common HTML entities
- Both templates contain the survey_link in rendered output
"""

import pytest
from jinja2 import UndefinedError

from app.services.template_service import html_to_text, render_template

# ---------------------------------------------------------------------------
# Shared fixture data
# ---------------------------------------------------------------------------

BASE_CONTEXT = {
    "survey_title": "Customer Satisfaction Survey",
    "survey_description": "Help us improve by sharing your experience.",
    "survey_link": "http://localhost:3000/s/abc123?token=xyz",
    "sender_name": "Survey Tool",
    "recipient_name": "Alice",
    "custom_message": None,
}


# ---------------------------------------------------------------------------
# Invitation template tests
# ---------------------------------------------------------------------------


def test_invitation_renders_with_all_variables():
    html = render_template("email/invitation.html", **BASE_CONTEXT)
    assert "Customer Satisfaction Survey" in html
    assert "Help us improve by sharing your experience." in html
    assert "http://localhost:3000/s/abc123?token=xyz" in html
    assert "Alice" in html


def test_invitation_recipient_name_defaults_to_there_when_none():
    ctx = {**BASE_CONTEXT, "recipient_name": None}
    html = render_template("email/invitation.html", **ctx)
    assert "Hello there" in html


def test_invitation_no_custom_message_block_when_none():
    ctx = {**BASE_CONTEXT, "custom_message": None}
    html = render_template("email/invitation.html", **ctx)
    # custom_message block should not appear
    assert "font-style: italic" not in html


def test_invitation_custom_message_appears_when_provided():
    ctx = {**BASE_CONTEXT, "custom_message": "Please complete this before Friday."}
    html = render_template("email/invitation.html", **ctx)
    assert "Please complete this before Friday." in html


def test_invitation_no_description_when_none():
    ctx = {**BASE_CONTEXT, "survey_description": None}
    html = render_template("email/invitation.html", **ctx)
    assert "Help us improve" not in html


def test_invitation_survey_link_in_output():
    html = render_template("email/invitation.html", **BASE_CONTEXT)
    assert "http://localhost:3000/s/abc123?token=xyz" in html
    assert "token=" in html


def test_invitation_sender_name_in_footer():
    html = render_template("email/invitation.html", **BASE_CONTEXT)
    assert "Survey Tool" in html


# ---------------------------------------------------------------------------
# Reminder template tests
# ---------------------------------------------------------------------------


def test_reminder_renders_with_all_variables():
    html = render_template("email/reminder.html", **BASE_CONTEXT)
    assert "Customer Satisfaction Survey" in html
    assert "http://localhost:3000/s/abc123?token=xyz" in html
    assert "Alice" in html


def test_reminder_recipient_name_defaults_to_there_when_none():
    ctx = {**BASE_CONTEXT, "recipient_name": None}
    html = render_template("email/reminder.html", **ctx)
    assert "Hello there" in html


def test_reminder_no_custom_message_block_when_none():
    ctx = {**BASE_CONTEXT, "custom_message": None}
    html = render_template("email/reminder.html", **ctx)
    assert "font-style: italic" not in html


def test_reminder_custom_message_appears_when_provided():
    ctx = {**BASE_CONTEXT, "custom_message": "Deadline is next Monday."}
    html = render_template("email/reminder.html", **ctx)
    assert "Deadline is next Monday." in html


def test_reminder_urgency_banner_present():
    html = render_template("email/reminder.html", **BASE_CONTEXT)
    assert "Reminder" in html


def test_reminder_survey_link_in_output():
    html = render_template("email/reminder.html", **BASE_CONTEXT)
    assert "http://localhost:3000/s/abc123?token=xyz" in html
    assert "token=" in html


# ---------------------------------------------------------------------------
# Missing required variable tests (StrictUndefined)
# ---------------------------------------------------------------------------


def test_invitation_raises_on_missing_survey_link():
    ctx = {k: v for k, v in BASE_CONTEXT.items() if k != "survey_link"}
    with pytest.raises(UndefinedError):
        render_template("email/invitation.html", **ctx)


def test_invitation_raises_on_missing_survey_title():
    ctx = {k: v for k, v in BASE_CONTEXT.items() if k != "survey_title"}
    with pytest.raises(UndefinedError):
        render_template("email/invitation.html", **ctx)


def test_reminder_raises_on_missing_survey_link():
    ctx = {k: v for k, v in BASE_CONTEXT.items() if k != "survey_link"}
    with pytest.raises(UndefinedError):
        render_template("email/reminder.html", **ctx)


# ---------------------------------------------------------------------------
# html_to_text tests
# ---------------------------------------------------------------------------


def test_html_to_text_strips_tags():
    html = "<p>Hello <strong>World</strong></p>"
    result = html_to_text(html)
    assert "<" not in result
    assert ">" not in result
    assert "Hello" in result
    assert "World" in result


def test_html_to_text_decodes_entities():
    html = "<p>A &amp; B &lt;test&gt; &quot;quoted&quot; &copy; 2024</p>"
    result = html_to_text(html)
    assert "&amp;" not in result
    assert "&lt;" not in result
    assert "&gt;" not in result
    assert "&quot;" not in result
    assert "A & B" in result
    assert "<test>" in result
    assert '"quoted"' in result
    assert "©" in result


def test_html_to_text_is_readable_from_invitation():
    html = render_template("email/invitation.html", **BASE_CONTEXT)
    text = html_to_text(html)
    assert "<" not in text
    assert "Customer Satisfaction Survey" in text
    assert "http://localhost:3000/s/abc123?token=xyz" in text


def test_html_to_text_is_readable_from_reminder():
    html = render_template("email/reminder.html", **BASE_CONTEXT)
    text = html_to_text(html)
    assert "<" not in text
    assert "Customer Satisfaction Survey" in text
    assert "http://localhost:3000/s/abc123?token=xyz" in text


def test_html_to_text_collapses_excessive_blank_lines():
    html = "<p>A</p><p></p><p></p><p></p><p>B</p>"
    text = html_to_text(html)
    assert "\n\n\n" not in text


def test_html_to_text_handles_br_tags():
    html = "Line 1<br />Line 2<br>Line 3"
    text = html_to_text(html)
    assert "Line 1" in text
    assert "Line 2" in text
    assert "Line 3" in text
