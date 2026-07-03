# SMS Backend — Flask REST API

## Stack
- Python + Flask (swappable: only app/api/ and middleware/ need rewriting)
- PostgreSQL via psycopg2 (swappable: only app/repositories/ need rewriting)
- JWT auth + data-driven RBAC

## Layer responsibilities
| Layer | Folder | Rule |
|---|---|---|
| Routes | app/api/v1/ | Thin — validate input, call service, return response |
| Middleware | app/middleware/ | JWT decode, RBAC permission check |
| Services | app/services/ | Business logic — zero Flask imports |
| Repositories | app/repositories/ | All SQL/DB calls — swap DB here only |
| Schemas | app/schemas/ | Marshmallow input/output validation |
| Models | app/models/ | Plain Python dataclasses |

## Setup
```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in DB credentials
python run.py
```

## API base URL
All endpoints: `http://localhost:5000/api/v1/`

## To swap Flask → FastAPI
Rewrite `app/api/v1/` and `app/middleware/` only. Services + repositories unchanged.

## To swap PostgreSQL → another DB
Rewrite `app/repositories/` only. Services, routes, schemas unchanged.
