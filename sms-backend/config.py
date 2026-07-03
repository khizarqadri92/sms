import os

class Config:
    SECRET_KEY             = os.getenv("SECRET_KEY",     "sms-secret-key-2024")
    JWT_SECRET_KEY         = os.getenv("JWT_SECRET_KEY", "sms-jwt-secret-2024")
    JWT_ACCESS_TOKEN_EXPIRES  = 86400    # 24 hours
    JWT_REFRESH_TOKEN_EXPIRES = 2592000  # 30 days

    DB_HOST     = os.getenv("DB_HOST",     "localhost")
    DB_PORT     = int(os.getenv("DB_PORT", "5432"))
    DB_NAME     = os.getenv("DB_NAME",     "sms_dev")
    DB_USER     = os.getenv("DB_USER",     "postgres")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "Zunnoon1@")

    UPLOAD_FOLDER      = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB

class DevelopmentConfig(Config):
    DEBUG   = True
    TESTING = False

class ProductionConfig(Config):
    DEBUG   = False
    TESTING = False

class TestingConfig(Config):
    DEBUG   = True
    TESTING = True

config = {
    "development": DevelopmentConfig,
    "production":  ProductionConfig,
    "testing":     TestingConfig,
    "default":     DevelopmentConfig,
}