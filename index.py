import os
from datetime import date
from typing import List, Dict, Optional

import google.generativeai as genai
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template # ⭐ CHANGED: Import render_template, not render_template_string
from pydantic import BaseModel
from sqlmodel import Field, Session, SQLModel, create_engine, select

load_dotenv()

app = Flask(__name__)
# Flask Secret Key for session management, crucial for production
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')

try:
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    if not GOOGLE_API_KEY:
        print("GOOGLE_API_KEY not found in environment variables. Translation service will be unavailable.")
        gemini_model = None
    else:
        genai.configure(api_key=GOOGLE_API_KEY)
        gemini_model = genai.GenerativeModel('gemini-2.5-flash')
except Exception as e:
    print(f"Error configuring Google Gemini API: {e}")
    gemini_model = None

# ⭐ IMPORTANT CHANGE: Use an environment variable for the database URL
# This is crucial for Vercel deployment and persistent storage
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL: # ⭐ ADDED: Check if DATABASE_URL is set and raise an error if not
    raise ValueError("DATABASE_URL environment variable is not set. Please set it for Supabase connection.")

engine = create_engine(DATABASE_URL, echo=True)

def create_db_and_tables():
    """Creates the database tables if they don't exist."""
    print("--- Attempting to create database tables ---")
    try:
        SQLModel.metadata.create_all(engine)
        print("--- Database tables created (if they didn't exist) ---")
    except Exception as e:
        print(f"--- ERROR creating database tables: {e} ---")
        # ⭐ ADDED: Re-raise the exception to indicate a critical startup failure
        raise

# In a serverless environment, database table creation might need to be
# handled by a separate migration script or on first access if idempotent.
# For simplicity, we'll keep it here, but be aware of its implications.
@app.before_request
def ensure_db_tables_exist():
    # This will attempt to create tables on every request, which is fine for small apps
    # but for larger apps, consider a separate migration script or a more advanced pattern.
    if not hasattr(app, 'db_initialized'):
        create_db_and_tables()
        app.db_initialized = True

class TodoItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: Optional[str] = None
    completed: bool = False
    priority: Optional[str] = Field(default=None, max_length=50)
    due_date: Optional[date] = Field(default=None)

class TodoItemCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[date] = None

class TodoItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    completed: Optional[bool] = None
    priority: Optional[str] = None
    due_date: Optional[date] = None

class TranslationRequest(BaseModel):
    text: str
    target_language: str

class TranslationResponse(BaseModel):
    translated_text: str

def get_session():
    # Use a try-finally block to ensure the session is always closed
    session = Session(engine)
    try:
        yield session
    finally:
        session.close()

# ⭐ ADDED: Route to serve index.html for local development
@app.route("/")
def serve_index():
    return render_template("index.html")

@app.route("/api/todos", methods=["GET"])
def get_all_todos_flask():
    print("--- Fetching all todos from DB ---")
    session_generator = get_session()
    session = next(session_generator)
    try:
        todos = session.exec(select(TodoItem)).all()
        print(f"--- Found {len(todos)} todos ---")
        # Convert SQLModel objects to dictionaries for jsonify, handling dates
        # Use model_dump(mode='json') to get JSON-serializable output for dates
        return jsonify([todo.model_dump(mode='json') for todo in todos])
    finally:
        session.close()

@app.route("/api/todos", methods=["POST"])
def create_todo_flask():
    todo_data = request.json
    print(f"--- Received TodoItemCreate: {todo_data} ---")
    try:
        todo_create = TodoItemCreate(**todo_data)
        db_todo = TodoItem.model_validate(todo_create)
        print(f"--- Converted to TodoItem for DB: {db_todo} ---")

        session_generator = get_session()
        session = next(session_generator)
        try:
            session.add(db_todo)
            session.commit()
            session.refresh(db_todo)
            print(f"--- Successfully added todo to DB. ID: {db_todo.id} ---")
            return jsonify(db_todo.model_dump(mode='json')), 201
        finally:
            session.close()
    except Exception as e:
        print(f"--- ERROR during todo creation: {e} ---")
        return jsonify({"detail": f"Failed to create todo: {e}"}), 400

@app.route("/api/todos/<int:todo_id>", methods=["PUT"])
def update_todo_flask(todo_id: int):
    todo_data = request.json
    print(f"--- Attempting to update todo ID: {todo_id} with data: {todo_data} ---")
    session_generator = get_session()
    session = next(session_generator)
    try:
        todo = session.get(TodoItem, todo_id)
        if not todo:
            print(f"--- Todo with ID {todo_id} not found for update ---")
            return jsonify({"detail": "To-Do item not found"}), 404

        todo_update = TodoItemUpdate(**todo_data)
        update_data = todo_update.model_dump(exclude_unset=True)
        print(f"--- Update data (excluding unset): {update_data} ---")

        for key, value in update_data.items():
            setattr(todo, key, value)

        session.add(todo)
        session.commit()
        session.refresh(todo)
        print(f"--- Successfully updated todo ID: {todo.id} ---")
        return jsonify(todo.model_dump(mode='json'))
    except Exception as e:
        print(f"--- ERROR during todo update and DB commit: {e} ---")
        return jsonify({"detail": f"Failed to update todo: {e}"}), 500
    finally:
        session.close()

@app.route("/api/todos/<int:todo_id>", methods=["DELETE"])
def delete_todo_flask(todo_id: int):
    print(f"--- Attempting to delete todo ID: {todo_id} ---")
    session_generator = get_session()
    session = next(session_generator)
    try:
        todo = session.get(TodoItem, todo_id)
        if not todo:
            print(f"--- Todo with ID {todo_id} not found for deletion ---")
            return jsonify({"detail": "To-Do item not found"}), 404

        session.delete(todo)
        session.commit()
        print(f"--- Successfully deleted todo ID: {todo_id} ---")
        return '', 204
    except Exception as e:
        print(f"--- ERROR during todo deletion and DB commit: {e} ---")
        return jsonify({"detail": f"Failed to delete todo: {e}"}), 500
    finally:
        session.close()

@app.route("/api/translate", methods=["POST"])
def translate_text_flask():
    if not gemini_model:
        return jsonify({"detail": "Translation service not available. API key might be missing or invalid."}), 503
    request_data = request.json
    try:
        translation_request = TranslationRequest(**request_data)
        prompt = f"Translate the following text into {translation_request.target_language}: {translation_request.text}"
        response = gemini_model.generate_content(prompt)
        translated_content = response.text
        return jsonify(TranslationResponse(translated_text=translated_content).model_dump(mode='json'))
    except Exception as e:
        print(f"Gemini translation error: {e}")
        return jsonify({"detail": f"Failed to translate text: {e}"}), 500

# This is the entry point for Vercel functions, but it's typically 'app' itself.
# Vercel finds the Flask app object and wraps it.
# No need for if __name__ == "__main__": app.run() for Vercel deployment.