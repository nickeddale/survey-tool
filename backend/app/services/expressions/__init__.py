"""Expression language services package.

Provides lexing (tokenization), parsing, and evaluation of survey expression
strings.
"""

from app.services.expressions.lexer import (
    tokenize,
    Token,
    TokenType,
    LexerError,
)
from app.services.expressions.ast_nodes import (
    ASTNode,
    BinaryOp,
    UnaryOp,
    Variable,
    Literal,
    FunctionCall,
    ArrayLiteral,
    ParserError,
)
from app.services.expressions.parser import parse
from app.services.expressions.evaluator import (
    evaluate,
    Evaluator,
    EvaluationError,
)
from app.services.expressions.resolver import (
    build_expression_context,
    ResolverError,
)
from app.services.expressions.relevance import (
    evaluate_relevance,
    RelevanceResult,
    CircularRelevanceError,
    RelevanceEvaluationError,
    clear_relevance_cache,
)

__all__ = [
    # Lexer
    "tokenize",
    "Token",
    "TokenType",
    "LexerError",
    # AST nodes
    "ASTNode",
    "BinaryOp",
    "UnaryOp",
    "Variable",
    "Literal",
    "FunctionCall",
    "ArrayLiteral",
    # Parser
    "parse",
    "ParserError",
    # Evaluator
    "evaluate",
    "Evaluator",
    "EvaluationError",
    # Resolver
    "build_expression_context",
    "ResolverError",
    # Relevance
    "evaluate_relevance",
    "RelevanceResult",
    "CircularRelevanceError",
    "RelevanceEvaluationError",
    "clear_relevance_cache",
]
