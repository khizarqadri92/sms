"""
Service layer — pure Python business logic.
Zero Flask imports. Fully unit-testable without a running server.
Depends on repositories (interfaces), never on SQL or psycopg2 directly.
"""

class CommunicationService:
    def __init__(self, repository=None):
        self._repo = repository
