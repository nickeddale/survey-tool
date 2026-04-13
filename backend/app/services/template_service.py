"""Jinja2 template rendering service for HTML emails.

Loads and renders Jinja2 templates from app/templates/.
Provides plain-text fallback generation by stripping HTML tags.
Templates are cached after first load by the Jinja2 Environment.
"""

import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

_TEMPLATES_DIR = Path(__file__).parent.parent / "templates"

_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"]),
    # StrictUndefined raises an UndefinedError if a required variable is missing,
    # rather than silently rendering an empty string. Use the | default() filter
    # in templates for intentionally optional variables.
    undefined=StrictUndefined,
)


def render_template(template_name: str, **context: object) -> str:
    """Render a Jinja2 template and return the HTML string.

    Args:
        template_name: Relative path to the template under app/templates/
                       (e.g. "email/invitation.html").
        **context: Template variables to pass to the renderer.

    Returns:
        Rendered HTML string.

    Raises:
        jinja2.UndefinedError: If a required template variable is missing.
        jinja2.TemplateNotFound: If the template file does not exist.
    """
    template = _env.get_template(template_name)
    return template.render(**context)


_TAG_RE = re.compile(r"<[^>]+>")
_MULTI_BLANK_LINES_RE = re.compile(r"\n{3,}")
_LEADING_WHITESPACE_RE = re.compile(r"^[ \t]+", re.MULTILINE)


def html_to_text(html: str) -> str:
    """Generate a readable plain-text version from an HTML string.

    Strips all HTML tags, collapses excessive blank lines, and removes
    leading whitespace from each line.

    Args:
        html: HTML string to convert.

    Returns:
        Plain text string suitable for the text/plain MIME part of an email.
    """
    # Replace common block-level tags with newlines for readability
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"</(?:p|div|tr|li|h[1-6]|blockquote)>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<(?:p|div|tr|li|h[1-6]|blockquote)[^>]*>", "\n", text, flags=re.IGNORECASE)

    # Strip all remaining tags
    text = _TAG_RE.sub("", text)

    # Decode common HTML entities
    text = (
        text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .replace("&mdash;", "—")
        .replace("&ndash;", "–")
        .replace("&#9888;", "⚠")
        .replace("&copy;", "©")
    )

    # Remove leading whitespace per line
    text = _LEADING_WHITESPACE_RE.sub("", text)

    # Collapse 3+ blank lines into 2
    text = _MULTI_BLANK_LINES_RE.sub("\n\n", text)

    return text.strip()
