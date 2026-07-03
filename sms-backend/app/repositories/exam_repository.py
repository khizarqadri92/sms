"""
Repository — all DB operations for this domain.
Calls stored procedures via psycopg2.
To swap DB engine: rewrite only this file. Service layer is untouched.
"""
from app.repositories.base_repository import BaseRepository
from app.db.connection import get_db

class ExamRepository(BaseRepository):

    def find_by_id(self, id):
        # TODO: implement using stored procedure
        pass

    def find_all(self, filters=None):
        # TODO: implement
        pass

    def create(self, data: dict):
        # TODO: call sp_create_* stored procedure
        pass

    def update(self, id, data: dict):
        # TODO: call sp_update_* stored procedure
        pass

    def delete(self, id):
        # TODO: implement
        pass
