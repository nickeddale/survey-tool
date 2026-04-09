"""Reusable pagination utilities."""

from fastapi import Query


class PaginationParams:
    def __init__(
        self,
        page: int = Query(default=1, ge=1),
        per_page: int = Query(default=20, ge=1, le=100),
    ) -> None:
        self.page = page
        self.per_page = per_page

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.per_page


def paginate(items: list, total: int, params: PaginationParams) -> dict:
    """Return a standard pagination envelope."""
    return {
        "items": items,
        "total": total,
        "page": params.page,
        "per_page": params.per_page,
    }
