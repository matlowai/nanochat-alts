import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import sys
import io
import contextlib
import traceback
import os
import json
import numpy as np
from typing import List, Optional
from dotenv import load_dotenv
from openai import OpenAI
import lancedb

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="NanoChat Bridge")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Global State ---
GRAPH_DATA = {"nodes": [], "links": []}
RAG_MODEL = None
OPENROUTER_CLIENT = None
DB = None
TABLE = None

# --- RAG Initialization ---
def init_rag():
    global GRAPH_DATA, RAG_MODEL, OPENROUTER_CLIENT, DB, TABLE
    
    print("Initializing Graph RAG with LanceDB...")
    
    # 1. Load Knowledge Graph
    try:
        with open("knowledge_graph.json", "r") as f:
            GRAPH_DATA = json.load(f)
        print(f"Loaded graph with {len(GRAPH_DATA['nodes'])} nodes.")
    except FileNotFoundError:
        print("Warning: knowledge_graph.json not found. RAG will be disabled.")
        return

    # 2. Initialize Embedding Model
    try:
        from sentence_transformers import SentenceTransformer
        # Using Qwen/Qwen3-Embedding-0.6B as requested
        RAG_MODEL = SentenceTransformer('Qwen/Qwen3-Embedding-0.6B', trust_remote_code=True)
        print("Embedding model loaded: Qwen/Qwen3-Embedding-0.6B")
    except ImportError:
        print("Error: sentence-transformers not installed. RAG disabled.")
        return
    except Exception as e:
        print(f"Error loading model: {e}")
        return

    # 3. Initialize LanceDB
    try:
        DB = lancedb.connect(".lancedb")
        
        # Prepare data for LanceDB
        data = []
        texts = []
        for node in GRAPH_DATA['nodes']:
            # Construct rich text for embedding:
            # "Function: my_func\nDocstring: This function does X."
            # or "File: my_file.py"
            # or "Concept: attention"
            
            label = node.get('label', '')
            node_type = node.get('type', 'unknown')
            docstring = node.get('docstring', '')
            source = node.get('source', 'unknown')
            library = node.get('library', '')
            file_path = node.get('file_path', '')
            
            if node_type in ['function', 'class']:
                text = f"{node_type.capitalize()}: {label}\nSource: {source}\nFile: {file_path}\nDescription: {docstring}"
            elif node_type == 'file':
                text = f"File: {label}\nSource: {source}\nDescription: {docstring}"
            else:
                text = f"{label} ({node_type}) - {node['id']}\nSource: {source}"
                if library:
                    text += f"\nLibrary: {library}"
            
            texts.append(text)
            data.append({
                "id": node['id'],
                "text": text,
                "type": node_type,
                "label": label,
                "source": source,
                "library": library,
                "file_path": file_path
                # "vector": ... (will be added)
            })
        
        if texts:
            embeddings = RAG_MODEL.encode(texts)
            for i, item in enumerate(data):
                item["vector"] = embeddings[i]
            
            # Create or Overwrite Table
            TABLE = DB.create_table("nodes", data=data, mode="overwrite")
            print(f"Indexed {len(data)} nodes in LanceDB.")
            
    except Exception as e:
        print(f"Error initializing LanceDB: {e}")
        return

    # ... OpenRouter init ...

# ...

class IndexRequest(BaseModel):
    id: str
    text: str
    type: str = "custom"
    label: str

# ...

@app.post("/index")
async def index_content(request: IndexRequest):
    """Dynamically adds content to the vector index."""
    if not TABLE or not RAG_MODEL:
        raise HTTPException(status_code=500, detail="RAG not initialized.")
    
    try:
        vector = RAG_MODEL.encode([request.text])[0]
        TABLE.add([{
            "id": request.id,
            "text": request.text,
            "type": request.type,
            "label": request.label,
            "vector": vector
        }])
        return {"status": "success", "message": f"Indexed {request.id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # 4. Initialize OpenRouter Client
    api_key = os.getenv("OPENROUTER_API_KEY")
    if api_key:
        OPENROUTER_CLIENT = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
        )
        print("OpenRouter client initialized.")
    else:
        print("Warning: OPENROUTER_API_KEY not found in .env. Chat will fail.")

# Initialize on startup
init_rag()

# --- Models ---
class ExecuteRequest(BaseModel):
    code: str

class ChatRequest(BaseModel):
    message: str
    context_nodes: Optional[List[str]] = None

class ChatResponse(BaseModel):
    response: str
    focused_nodes: List[str]

# --- Endpoints ---

@app.post("/execute")
async def execute_code(request: ExecuteRequest):
    """Executes Python code and returns output."""
    code = request.code
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()
    
    try:
        with contextlib.redirect_stdout(stdout_capture), contextlib.redirect_stderr(stderr_capture):
            exec_globals = {}
            exec(code, exec_globals)
            
        return {
            "stdout": stdout_capture.getvalue(),
            "stderr": stderr_capture.getvalue(),
            "status": "success"
        }
    except Exception:
        return {
            "stdout": stdout_capture.getvalue(),
            "stderr": traceback.format_exc(),
            "status": "error"
        }

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Graph RAG Chat Endpoint using LanceDB.
    """
    if not OPENROUTER_CLIENT:
        raise HTTPException(status_code=500, detail="OpenRouter API Key not configured.")
    
    query = request.message
    
    # 1. Retrieve Relevant Nodes via LanceDB
    relevant_nodes = []
    if RAG_MODEL and TABLE:
        query_embedding = RAG_MODEL.encode([query])[0]
        results = TABLE.search(query_embedding).limit(5).to_list()
        
        for res in results:
            # Distance threshold could be applied here if needed
            relevant_nodes.append(res["id"])
    
    # 2. Construct System Prompt
    context_str = "Relevant Codebase Nodes:\n"
    for node_id in relevant_nodes:
        node = next((n for n in GRAPH_DATA['nodes'] if n['id'] == node_id), None)
        if node:
            context_str += f"- {node['label']} ({node['type']}): {node['id']}\n"
            
    system_prompt = f"""You are an expert AI assistant for the 'nanochat' codebase.
You have access to a Knowledge Graph of the code.
Your goal is to answer the user's questions about the code and guide them through the graph.

{context_str}

Instructions:
1. Answer the user's question based on the context and your general knowledge of LLMs/Python.
2. You MUST identify which nodes in the graph are most relevant to your answer.
3. Return your response in JSON format with two fields:
   - "response": The text of your answer (markdown supported).
   - "focused_nodes": A list of node IDs that should be highlighted/focused in the viewer.

Example JSON:
{{
  "response": "The `GPT` class is defined in `gpt.py`. It uses `CausalSelfAttention`.",
  "focused_nodes": ["nanochat/gpt.py", "CausalSelfAttention"]
}}
"""

    # 3. Call LLM
    try:
        completion = OPENROUTER_CLIENT.chat.completions.create(
            model="google/gemini-2.0-flash-exp:free",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ],
            response_format={"type": "json_object"}
        )
        
        content = completion.choices[0].message.content
        result = json.loads(content)
        
        valid_ids = set(n['id'] for n in GRAPH_DATA['nodes'])
        safe_focused = [nid for nid in result.get("focused_nodes", []) if nid in valid_ids]
        
        return ChatResponse(
            response=result.get("response", "I couldn't generate a response."),
            focused_nodes=safe_focused
        )
        
    except Exception as e:
        print(f"LLM Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    print("Starting NanoChat Bridge on http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
