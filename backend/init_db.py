from sqlalchemy import text
from database import engine
import models

with engine.connect() as conn:
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
    conn.commit()

models.Base.metadata.create_all(bind=engine)
print("Database initialized successfully.")
