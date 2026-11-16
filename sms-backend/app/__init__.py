from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from config import config
import os

jwt = JWTManager()

def create_app(env=None):
    app = Flask(__name__)
    env = env or os.getenv("FLASK_ENV", "default")
    app.config.from_object(config[env])
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    jwt.init_app(app)

    # Background jobs are NOT started here. create_app() runs once per Uvicorn
    # worker (and again under --reload), which used to start duplicate
    # schedulers. All jobs now run in the single dedicated process:
    #     python scheduler_service.py

    from app.db.connection import init_pool
    init_pool(app)

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": "v1"}

    return app
