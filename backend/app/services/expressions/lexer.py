"""Expression language lexer/tokenizer.

Converts expression strings into typed token sequences for downstream parsing.
Enforces a 4096-character input limit and tracks token positions for error reporting.

Token types:
    VARIABLE    - {Q1}, {Q1_SQ001}, {RESPONDENT.attr}
    STRING      - "hello", 'world' (with escape sequences)
    NUMBER      - 42, 3.14
    BOOLEAN     - true, false
    NULL        - null
    OPERATOR    - ==, !=, >, <, >=, <=
    LOGICAL     - and, or, not
    STRING_OP   - contains (as infix operator), starts_with, ends_with
    MEMBERSHIP  - in
    FUNCTION    - is_empty, count, sum, min, max, length, regex_match,
                  contains (when followed by '(')
    LPAREN      - (
    RPAREN      - )
    LBRACKET    - [
    RBRACKET    - ]
    COMMA       - ,
    EOF         - end of input sentinel
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum

__all__ = ["tokenize", "Token", "TokenType", "LexerError"]

MAX_EXPRESSION_LENGTH = 4096

# Pattern for valid variable names inside braces.
# Allows letters, digits, underscore, dot — validated after scanning.
_VARIABLE_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_.]*$")


class TokenType(str, Enum):
    """Token type identifiers.

    Inherits from str so token types compare equal to their string values,
    making downstream parser comparisons straightforward.
    """

    VARIABLE = "VARIABLE"
    STRING = "STRING"
    NUMBER = "NUMBER"
    BOOLEAN = "BOOLEAN"
    NULL = "NULL"
    OPERATOR = "OPERATOR"
    LOGICAL = "LOGICAL"
    STRING_OP = "STRING_OP"
    MEMBERSHIP = "MEMBERSHIP"
    FUNCTION = "FUNCTION"
    LPAREN = "LPAREN"
    RPAREN = "RPAREN"
    LBRACKET = "LBRACKET"
    RBRACKET = "RBRACKET"
    COMMA = "COMMA"
    EOF = "EOF"


@dataclass
class Token:
    """A single lexical token with type, value, and source position.

    Attributes:
        type:  The TokenType of this token.
        value: The string value of the token (raw text for most tokens;
               for variables, the name without braces; for numbers, the
               numeric string as scanned).
        start: Zero-based index of the first character in the source.
        end:   Zero-based index one past the last character (exclusive).
    """

    type: TokenType
    value: str
    start: int
    end: int


class LexerError(ValueError):
    """Raised when the lexer encounters invalid input.

    Attributes:
        message:  Human-readable description of the error.
        position: Zero-based character index in the source where the error
                  was detected.  Callers can inspect this programmatically
                  without parsing the message string.
    """

    def __init__(self, message: str, position: int) -> None:
        super().__init__(message)
        self.position = position

    def __str__(self) -> str:
        return f"{super().__str__()} (position {self.position})"


# ---------------------------------------------------------------------------
# Keyword classification tables
# ---------------------------------------------------------------------------

_LOGICAL_KEYWORDS: frozenset[str] = frozenset({"and", "or", "not"})
_STRING_OP_KEYWORDS: frozenset[str] = frozenset({"starts_with", "ends_with"})
# 'contains' is special: STRING_OP by default, FUNCTION when followed by '('
_FUNCTION_KEYWORDS: frozenset[str] = frozenset(
    {"is_empty", "count", "sum", "min", "max", "length", "regex_match"}
)


class Lexer:
    """Hand-written character-by-character lexer for survey expression strings."""

    def __init__(self, source: str) -> None:
        if len(source) > MAX_EXPRESSION_LENGTH:
            raise LexerError(
                f"Expression exceeds maximum length of {MAX_EXPRESSION_LENGTH} characters "
                f"(got {len(source)})",
                position=MAX_EXPRESSION_LENGTH,
            )
        self._source = source
        self._pos = 0
        self._tokens: list[Token] = []

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def tokenize(self) -> list[Token]:
        """Scan the entire source string and return the token list.

        The returned list always ends with an EOF token.
        """
        while self._pos < len(self._source):
            self._scan_next()
        self._tokens.append(Token(TokenType.EOF, "", self._pos, self._pos))
        return self._tokens

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _peek(self, offset: int = 0) -> str:
        """Return the character at pos+offset, or '' if past end."""
        idx = self._pos + offset
        if idx < len(self._source):
            return self._source[idx]
        return ""

    def _advance(self) -> str:
        """Return the current character and advance the position cursor."""
        ch = self._source[self._pos]
        self._pos += 1
        return ch

    def _scan_next(self) -> None:
        """Identify and dispatch scanning for the next token."""
        ch = self._peek()

        # Skip whitespace
        if ch.isspace():
            self._pos += 1
            return

        # Variable reference
        if ch == "{":
            self._scan_variable()
            return

        # String literal
        if ch in ('"', "'"):
            self._scan_string()
            return

        # Number literal
        if ch.isdigit():
            self._scan_number()
            return

        # Keyword or identifier
        if ch.isalpha() or ch == "_":
            self._scan_keyword_or_identifier()
            return

        # Two-character operators
        two = self._source[self._pos : self._pos + 2]
        if two in ("==", "!=", ">=", "<="):
            start = self._pos
            self._pos += 2
            self._tokens.append(Token(TokenType.OPERATOR, two, start, self._pos))
            return

        # Single-character operators and punctuation
        if ch in (">", "<"):
            start = self._pos
            self._advance()
            self._tokens.append(Token(TokenType.OPERATOR, ch, start, self._pos))
            return

        if ch == "(":
            start = self._pos
            self._advance()
            self._tokens.append(Token(TokenType.LPAREN, ch, start, self._pos))
            return

        if ch == ")":
            start = self._pos
            self._advance()
            self._tokens.append(Token(TokenType.RPAREN, ch, start, self._pos))
            return

        if ch == "[":
            start = self._pos
            self._advance()
            self._tokens.append(Token(TokenType.LBRACKET, ch, start, self._pos))
            return

        if ch == "]":
            start = self._pos
            self._advance()
            self._tokens.append(Token(TokenType.RBRACKET, ch, start, self._pos))
            return

        if ch == ",":
            start = self._pos
            self._advance()
            self._tokens.append(Token(TokenType.COMMA, ch, start, self._pos))
            return

        raise LexerError(
            f"Unexpected character {ch!r}",
            position=self._pos,
        )

    # ------------------------------------------------------------------
    # Variable scanning
    # ------------------------------------------------------------------

    def _scan_variable(self) -> None:
        """Scan a {VARNAME} reference.

        The opening '{' has already been peeked but not consumed.
        Emits a VARIABLE token with the name (without braces) as the value.
        """
        start = self._pos
        self._advance()  # consume '{'

        name_start = self._pos
        while self._pos < len(self._source) and self._source[self._pos] not in ("}", "\n"):
            self._pos += 1

        if self._pos >= len(self._source) or self._source[self._pos] != "}":
            raise LexerError(
                "Unterminated variable reference '{'",
                position=start,
            )

        name = self._source[name_start : self._pos]
        self._advance()  # consume '}'

        if not name:
            raise LexerError(
                "Empty variable reference '{}'",
                position=start,
            )

        if not _VARIABLE_PATTERN.match(name):
            raise LexerError(
                f"Invalid variable name {name!r}",
                position=start,
            )

        self._tokens.append(Token(TokenType.VARIABLE, name, start, self._pos))

    # ------------------------------------------------------------------
    # String scanning
    # ------------------------------------------------------------------

    def _scan_string(self) -> None:
        """Scan a quoted string literal (single or double quotes).

        Processes escape sequences: \\, \", \'.
        Raises LexerError for unterminated strings.
        """
        start = self._pos
        quote = self._advance()  # consume opening quote
        chars: list[str] = []

        while self._pos < len(self._source):
            ch = self._source[self._pos]

            if ch == "\\":
                self._pos += 1  # consume backslash
                if self._pos >= len(self._source):
                    raise LexerError(
                        "Unterminated string: escape at end of input",
                        position=start,
                    )
                escaped = self._source[self._pos]
                self._pos += 1
                if escaped == "\\":
                    chars.append("\\")
                elif escaped == '"':
                    chars.append('"')
                elif escaped == "'":
                    chars.append("'")
                elif escaped == "n":
                    chars.append("\n")
                elif escaped == "t":
                    chars.append("\t")
                else:
                    # Keep the backslash for unrecognised escapes
                    chars.append("\\")
                    chars.append(escaped)
                continue

            if ch == quote:
                self._pos += 1  # consume closing quote
                self._tokens.append(
                    Token(TokenType.STRING, "".join(chars), start, self._pos)
                )
                return

            chars.append(ch)
            self._pos += 1

        raise LexerError(
            f"Unterminated string starting with {quote!r}",
            position=start,
        )

    # ------------------------------------------------------------------
    # Number scanning
    # ------------------------------------------------------------------

    def _scan_number(self) -> None:
        """Scan an integer or floating-point number literal."""
        start = self._pos

        while self._pos < len(self._source) and self._source[self._pos].isdigit():
            self._pos += 1

        # Optional fractional part
        if (
            self._pos < len(self._source)
            and self._source[self._pos] == "."
            and self._pos + 1 < len(self._source)
            and self._source[self._pos + 1].isdigit()
        ):
            self._pos += 1  # consume '.'
            while self._pos < len(self._source) and self._source[self._pos].isdigit():
                self._pos += 1

        raw = self._source[start : self._pos]
        self._tokens.append(Token(TokenType.NUMBER, raw, start, self._pos))

    # ------------------------------------------------------------------
    # Keyword / identifier scanning
    # ------------------------------------------------------------------

    def _scan_keyword_or_identifier(self) -> None:
        """Scan a word and classify it into the correct token type.

        Classification order:
          true / false          -> BOOLEAN
          null                  -> NULL
          and / or / not        -> LOGICAL
          starts_with/ends_with -> STRING_OP
          contains              -> STRING_OP unless followed by '(' (FUNCTION)
          in                    -> MEMBERSHIP
          is_empty / count /
          sum / min / max /
          length / regex_match  -> FUNCTION
          anything else         -> LexerError (unknown identifier)
        """
        start = self._pos

        # Read the full word (letters, digits, underscore)
        while self._pos < len(self._source) and (
            self._source[self._pos].isalnum() or self._source[self._pos] == "_"
        ):
            self._pos += 1

        word = self._source[start : self._pos]

        if word == "true" or word == "false":
            self._tokens.append(Token(TokenType.BOOLEAN, word, start, self._pos))
            return

        if word == "null":
            self._tokens.append(Token(TokenType.NULL, word, start, self._pos))
            return

        if word in _LOGICAL_KEYWORDS:
            self._tokens.append(Token(TokenType.LOGICAL, word, start, self._pos))
            return

        if word in _STRING_OP_KEYWORDS:
            self._tokens.append(Token(TokenType.STRING_OP, word, start, self._pos))
            return

        if word == "contains":
            # Lookahead past optional whitespace to check for '('
            # If '(' follows, treat as FUNCTION; otherwise STRING_OP.
            lookahead = self._pos
            while lookahead < len(self._source) and self._source[lookahead].isspace():
                lookahead += 1
            if lookahead < len(self._source) and self._source[lookahead] == "(":
                self._tokens.append(Token(TokenType.FUNCTION, word, start, self._pos))
            else:
                self._tokens.append(Token(TokenType.STRING_OP, word, start, self._pos))
            return

        if word == "in":
            self._tokens.append(Token(TokenType.MEMBERSHIP, word, start, self._pos))
            return

        if word in _FUNCTION_KEYWORDS:
            self._tokens.append(Token(TokenType.FUNCTION, word, start, self._pos))
            return

        raise LexerError(
            f"Unknown identifier {word!r}",
            position=start,
        )


# ---------------------------------------------------------------------------
# Module-level convenience function
# ---------------------------------------------------------------------------


def tokenize(expression: str) -> list[Token]:
    """Tokenize an expression string into a list of Tokens.

    Args:
        expression: The expression string to lex.  Must be at most
                    4096 characters.

    Returns:
        A list of Token objects ending with an EOF token.

    Raises:
        LexerError: If the expression exceeds the character limit,
                    contains an invalid character, has an unterminated
                    string or variable reference, or uses an unknown
                    identifier.
    """
    return Lexer(expression).tokenize()
