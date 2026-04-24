from sqlalchemy import text

from database import get_engine
import models

engine = get_engine()

with engine.connect() as conn:
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
    conn.commit()

models.Base.metadata.create_all(bind=engine)
print("Database initialized successfully.")
