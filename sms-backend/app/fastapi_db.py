"""
FastAPI-native database access. Reuses the exact same psycopg2 connection pool
that Flask's app/db/connection.py initializes at startup (main.py creates the
Flask app first, which calls init_pool() - by the time FastAPI serves its first
request, the pool already exists as a plain module-level object with no Flask
context tied to it).

Flask's get_db() caches the connection on flask.g for the request's lifetime;
that mechanism is Flask-specific and unavailable to native FastAPI routes. This
module replicates the same per-request lifecycle (checkout -> use -> commit or
rollback -> return to pool) using FastAPI's own generator-based dependency
injection instead.
"""

import psycopg2.extras
from app.db import connection as flask_db_module


def get_db():
    """
    FastAPI dependency. Yields a connection checked out from the shared pool,
    committing on success or rolling back on exception, then always returning
    it to the pool - the FastAPI-native equivalent of Flask's teardown_appcontext.
    """
    db = flask_db_module._pool.getconn()
    db.autocommit = False
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        flask_db_module._pool.putconn(db)


def get_cur(db):
    """Matches the get_cur() helper pattern used throughout the Flask blueprints."""
    return db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
