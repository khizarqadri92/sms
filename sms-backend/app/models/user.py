"""
Plain Python dataclass — no ORM, no DB dependency.
Passed between service and route layers.
"""
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime
