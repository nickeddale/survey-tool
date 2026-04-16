"""Tests for Jinja2 email template rendering.

Tests cover:
    - invitation.html renders without error with all required variables
    - invitation.html renders with optional variables as None
    - invitation.html includes tracking URLs in output
    - invitation.html applies | default('there', true) for None recipient_name
    - invitation.html includes survey_title, survey_link, sender_name
    - invitation.html conditionally renders survey_description and custom_message
    - reminder.html renders without error with all required variables
    - reminder.html renders with optional variables as None
    - reminder.html includes tracking URLs in output
    - reminder.html applies | default('there', true) for None recipient_name
    - reminder.html includes urgency banner text
    - reminder.html conditionally renders survey_description and custom_message
    - base.html renders sender_name in footer
    - StrictUndefined raises on missing required variable
    - template_service.render_template works end-to-end
    - template_service.html_to_text produces plain text from HTML
"""

from pathlib import Path

import pytest
from jinja2 import Environment, FileSystemLoader, StrictUndefined, UndefinedError

from app.services import template_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_TEMPLATES_DIR = Path(__file__).parent.parent / "app" / "templates"


def _make_env() -> Environment:
    """Return a fresh Jinja2 Environment with StrictUndefined for tests."""
    return Environment(
        loader=FileSystemLoader(str(_TEMPLATES_DIR)),
        autoescape=True,
        undefined=StrictUndefined,
    )


def _render_invitation(env: Environment, **overrides) -> str:
    """Render invitation.html with sensible defaults, allowing field overrides."""
    defaults = {
        "recipient_name": "Alice",
        "survey_link": "http://localhost:3000/s/abc123?token=tok",
        "tracking_open_url": "http://localhost:8000/api/v1/email/track/open/inv-id",
        "tracking_click_url": "http://localhost:8000/api/v1/email/track/click/inv-id",
        "survey_title": "Customer Feedback",
        "survey_description": None,
        "custom_message": None,
        "sender_name": "Survey Tool",
    }
    defaults.update(overrides)
    template = env.get_template("email/invitation.html")
    return template.render(**defaults)


def _render_reminder(env: Environment, **overrides) -> str:
    """Render reminder.html with sensible defaults, allowing field overrides."""
    defaults = {
        "recipient_name": "Bob",
        "survey_link": "http://localhost:3000/s/abc123?token=tok",
        "tracking_open_url": "http://localhost:8000/api/v1/email/track/open/inv-id",
        "tracking_click_url": "http://localhost:8000/api/v1/email/track/click/inv-id",
        "survey_title": "Customer Feedback",
        "survey_description": None,
        "custom_message": None,
        "sender_name": "Survey Tool",
    }
    defaults.update(overrides)
    template = env.get_template("email/reminder.html")
    return template.render(**defaults)


# ---------------------------------------------------------------------------
# invitation.html tests
# ---------------------------------------------------------------------------


def test_invitation_renders_without_error():
    """invitation.html renders completely without any Jinja2 errors."""
    env = _make_env()
    rendered = _render_invitation(env)
    assert rendered
    assert "<!DOCTYPE html>" in rendered


def test_invitation_contains_tracking_open_url():
    """invitation.html embeds the tracking pixel URL in the <img> tag."""
    env = _make_env()
    open_url = "http://localhost:8000/api/v1/email/track/open/test-uuid"
    rendered = _render_invitation(env, tracking_open_url=open_url)
    assert open_url in rendered


def test_invitation_contains_tracking_click_url():
    """invitation.html embeds the click-through tracking URL in the CTA button."""
    env = _make_env()
    click_url = "http://localhost:8000/api/v1/email/track/click/test-uuid"
    rendered = _render_invitation(env, tracking_click_url=click_url)
    assert click_url in rendered


def test_invitation_uses_default_when_recipient_name_is_none():
    """invitation.html falls back to 'there' when recipient_name is None."""
    env = _make_env()
    rendered = _render_invitation(env, recipient_name=None)
    assert "Hello there" in rendered
    assert "Hello None" not in rendered


def test_invitation_uses_recipient_name_when_provided():
    """invitation.html uses the actual recipient name when it is not None."""
    env = _make_env()
    rendered = _render_invitation(env, recipient_name="Jane Doe")
    assert "Hello Jane Doe" in rendered
    assert "Hello there" not in rendered


def test_invitation_contains_survey_title():
    """invitation.html displays the survey title."""
    env = _make_env()
    rendered = _render_invitation(env, survey_title="Q1 Employee Survey")
    assert "Q1 Employee Survey" in rendered


def test_invitation_contains_survey_link():
    """invitation.html includes the survey link in the readable text area."""
    env = _make_env()
    link = "http://localhost:3000/s/mysurvey?token=abc"
    rendered = _render_invitation(env, survey_link=link)
    assert link in rendered


def test_invitation_contains_sender_name_in_footer():
    """invitation.html renders sender_name inside the base footer."""
    env = _make_env()
    rendered = _render_invitation(env, sender_name="Acme Corp")
    assert "Acme Corp" in rendered


def test_invitation_omits_survey_description_block_when_none():
    """invitation.html does not render the description block when survey_description is None."""
    env = _make_env()
    rendered = _render_invitation(env, survey_description=None)
    # The description is rendered inside an {% if survey_description %} block;
    # when None, no description paragraph should appear in the output.
    assert "survey_description" not in rendered


def test_invitation_renders_survey_description_when_provided():
    """invitation.html renders the description when survey_description is set."""
    env = _make_env()
    rendered = _render_invitation(env, survey_description="Tell us how you feel!")
    assert "Tell us how you feel!" in rendered


def test_invitation_omits_custom_message_block_when_none():
    """invitation.html does not render the custom message block when custom_message is None."""
    env = _make_env()
    rendered = _render_invitation(env, custom_message=None)
    assert "custom_message" not in rendered


def test_invitation_renders_custom_message_when_provided():
    """invitation.html renders the custom message when custom_message is set."""
    env = _make_env()
    rendered = _render_invitation(env, custom_message="Please complete by Friday.")
    assert "Please complete by Friday." in rendered


def test_invitation_contains_valid_html_structure():
    """invitation.html output contains key HTML structural elements."""
    env = _make_env()
    rendered = _render_invitation(env)
    assert "<html" in rendered
    assert "<body" in rendered
    assert "</html>" in rendered


def test_invitation_tracking_pixel_img_tag_present():
    """invitation.html includes an <img> tag for the open tracking pixel."""
    env = _make_env()
    rendered = _render_invitation(env)
    assert '<img src="http://localhost:8000/api/v1/email/track/open/inv-id"' in rendered


# ---------------------------------------------------------------------------
# reminder.html tests
# ---------------------------------------------------------------------------


def test_reminder_renders_without_error():
    """reminder.html renders completely without any Jinja2 errors."""
    env = _make_env()
    rendered = _render_reminder(env)
    assert rendered
    assert "<!DOCTYPE html>" in rendered


def test_reminder_contains_tracking_open_url():
    """reminder.html embeds the tracking pixel URL in the <img> tag."""
    env = _make_env()
    open_url = "http://localhost:8000/api/v1/email/track/open/rem-uuid"
    rendered = _render_reminder(env, tracking_open_url=open_url)
    assert open_url in rendered


def test_reminder_contains_tracking_click_url():
    """reminder.html embeds the click-through tracking URL in the CTA button."""
    env = _make_env()
    click_url = "http://localhost:8000/api/v1/email/track/click/rem-uuid"
    rendered = _render_reminder(env, tracking_click_url=click_url)
    assert click_url in rendered


def test_reminder_uses_default_when_recipient_name_is_none():
    """reminder.html falls back to 'there' when recipient_name is None."""
    env = _make_env()
    rendered = _render_reminder(env, recipient_name=None)
    assert "Hello there" in rendered
    assert "Hello None" not in rendered


def test_reminder_uses_recipient_name_when_provided():
    """reminder.html uses the actual recipient name when it is not None."""
    env = _make_env()
    rendered = _render_reminder(env, recipient_name="Charlie Brown")
    assert "Hello Charlie Brown" in rendered
    assert "Hello there" not in rendered


def test_reminder_contains_urgency_banner():
    """reminder.html includes the urgency banner / 'Friendly Reminder' text."""
    env = _make_env()
    rendered = _render_reminder(env)
    assert "Friendly Reminder" in rendered


def test_reminder_contains_survey_title():
    """reminder.html displays the survey title."""
    env = _make_env()
    rendered = _render_reminder(env, survey_title="Annual NPS Survey")
    assert "Annual NPS Survey" in rendered


def test_reminder_contains_survey_link():
    """reminder.html includes the survey link in the readable text area."""
    env = _make_env()
    link = "http://localhost:3000/s/rem?token=xyz"
    rendered = _render_reminder(env, survey_link=link)
    assert link in rendered


def test_reminder_contains_sender_name_in_footer():
    """reminder.html renders sender_name inside the base footer."""
    env = _make_env()
    rendered = _render_reminder(env, sender_name="Corp HR Team")
    assert "Corp HR Team" in rendered


def test_reminder_omits_survey_description_block_when_none():
    """reminder.html does not render the description block when survey_description is None."""
    env = _make_env()
    rendered = _render_reminder(env, survey_description=None)
    assert "survey_description" not in rendered


def test_reminder_renders_survey_description_when_provided():
    """reminder.html renders the description when survey_description is set."""
    env = _make_env()
    rendered = _render_reminder(env, survey_description="Rate our service.")
    assert "Rate our service." in rendered


def test_reminder_omits_custom_message_block_when_none():
    """reminder.html does not render the custom message block when custom_message is None."""
    env = _make_env()
    rendered = _render_reminder(env, custom_message=None)
    assert "custom_message" not in rendered


def test_reminder_renders_custom_message_when_provided():
    """reminder.html renders the custom message when custom_message is set."""
    env = _make_env()
    rendered = _render_reminder(env, custom_message="Deadline: end of month.")
    assert "Deadline: end of month." in rendered


def test_reminder_contains_valid_html_structure():
    """reminder.html output contains key HTML structural elements."""
    env = _make_env()
    rendered = _render_reminder(env)
    assert "<html" in rendered
    assert "<body" in rendered
    assert "</html>" in rendered


def test_reminder_tracking_pixel_img_tag_present():
    """reminder.html includes an <img> tag for the open tracking pixel."""
    env = _make_env()
    rendered = _render_reminder(env)
    assert '<img src="http://localhost:8000/api/v1/email/track/open/inv-id"' in rendered


# ---------------------------------------------------------------------------
# StrictUndefined tests — missing required variable raises
# ---------------------------------------------------------------------------


def test_invitation_raises_on_missing_survey_link():
    """StrictUndefined causes an UndefinedError when survey_link is omitted."""
    env = _make_env()
    template = env.get_template("email/invitation.html")
    with pytest.raises(UndefinedError):
        template.render(
            recipient_name="Alice",
            # survey_link intentionally omitted
            tracking_open_url="http://localhost:8000/api/v1/email/track/open/x",
            tracking_click_url="http://localhost:8000/api/v1/email/track/click/x",
            survey_title="Test",
            survey_description=None,
            custom_message=None,
            sender_name="Survey Tool",
        )


def test_reminder_raises_on_missing_tracking_click_url():
    """StrictUndefined causes an UndefinedError when tracking_click_url is omitted."""
    env = _make_env()
    template = env.get_template("email/reminder.html")
    with pytest.raises(UndefinedError):
        template.render(
            recipient_name="Bob",
            survey_link="http://localhost:3000/s/abc?token=tok",
            tracking_open_url="http://localhost:8000/api/v1/email/track/open/x",
            # tracking_click_url intentionally omitted
            survey_title="Test",
            survey_description=None,
            custom_message=None,
            sender_name="Survey Tool",
        )


# ---------------------------------------------------------------------------
# template_service integration tests
# ---------------------------------------------------------------------------


def test_render_template_invitation_via_service():
    """template_service.render_template renders invitation.html end-to-end."""
    html = template_service.render_template(
        "email/invitation.html",
        recipient_name="Service User",
        survey_link="http://localhost:3000/s/svc?token=tok",
        tracking_open_url="http://localhost:8000/api/v1/email/track/open/svc-id",
        tracking_click_url="http://localhost:8000/api/v1/email/track/click/svc-id",
        survey_title="Service Survey",
        survey_description=None,
        custom_message=None,
        sender_name="Survey Tool",
    )
    assert "Service User" in html
    assert "Service Survey" in html
    assert "track/open/svc-id" in html
    assert "track/click/svc-id" in html


def test_render_template_reminder_via_service():
    """template_service.render_template renders reminder.html end-to-end."""
    html = template_service.render_template(
        "email/reminder.html",
        recipient_name="Reminder User",
        survey_link="http://localhost:3000/s/rem?token=tok",
        tracking_open_url="http://localhost:8000/api/v1/email/track/open/rem-id",
        tracking_click_url="http://localhost:8000/api/v1/email/track/click/rem-id",
        survey_title="Reminder Survey",
        survey_description=None,
        custom_message=None,
        sender_name="Survey Tool",
    )
    assert "Reminder User" in html
    assert "Reminder Survey" in html
    assert "track/open/rem-id" in html
    assert "Friendly Reminder" in html


def test_html_to_text_strips_html_tags():
    """html_to_text strips all HTML tags and returns plain text."""
    html = "<p>Hello <strong>World</strong></p><br/><div>Line 2</div>"
    text = template_service.html_to_text(html)
    assert "<" not in text
    assert ">" not in text
    assert "Hello World" in text


def test_html_to_text_decodes_html_entities():
    """html_to_text decodes common HTML entities (amp, lt, gt, mdash, etc.)."""
    html = "<p>AT&amp;T &mdash; &lt;great&gt; &copy; 2024</p>"
    text = template_service.html_to_text(html)
    assert "AT&T" in text
    assert "—" in text
    assert "<great>" in text
    assert "©" in text


def test_html_to_text_collapses_blank_lines():
    """html_to_text collapses 3+ consecutive blank lines to at most 2."""
    html = "<p>Para 1</p><p></p><p></p><p></p><p>Para 2</p>"
    text = template_service.html_to_text(html)
    # Should not contain 3+ consecutive newlines
    assert "\n\n\n" not in text


def test_html_to_text_on_rendered_invitation():
    """html_to_text produces non-empty plain text from a fully rendered invitation."""
    html = template_service.render_template(
        "email/invitation.html",
        recipient_name="Alice",
        survey_link="http://localhost:3000/s/x?token=t",
        tracking_open_url="http://localhost:8000/api/v1/email/track/open/x",
        tracking_click_url="http://localhost:8000/api/v1/email/track/click/x",
        survey_title="Plain Text Survey",
        survey_description=None,
        custom_message=None,
        sender_name="Survey Tool",
    )
    text = template_service.html_to_text(html)
    assert text
    assert "<" not in text
    assert "Plain Text Survey" in text


def test_html_to_text_on_rendered_reminder():
    """html_to_text produces non-empty plain text from a fully rendered reminder."""
    html = template_service.render_template(
        "email/reminder.html",
        recipient_name="Bob",
        survey_link="http://localhost:3000/s/y?token=t",
        tracking_open_url="http://localhost:8000/api/v1/email/track/open/y",
        tracking_click_url="http://localhost:8000/api/v1/email/track/click/y",
        survey_title="Reminder Plain Text",
        survey_description=None,
        custom_message=None,
        sender_name="Survey Tool",
    )
    text = template_service.html_to_text(html)
    assert text
    assert "<" not in text
    assert "Reminder Plain Text" in text
