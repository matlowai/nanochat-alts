import uvicorn
from fastapi import FastAPI, HTTPException, Header
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
print(f"Current Working Directory: {os.getcwd()}")
print(f".env exists: {os.path.exists('.env')}")
load_dotenv()
print(f"OPENROUTER_API_KEY found: {'Yes' if os.getenv('OPENROUTER_API_KEY') else 'No'}")

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

    # 4. Initialize OpenRouter Client (MOVED OUT)
    pass

def init_chat():
    global OPENROUTER_CLIENT
    api_key = os.getenv("OPENROUTER_API_KEY")
    if api_key:
        OPENROUTER_CLIENT = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            default_headers={
                "HTTP-Referer": "http://localhost:8999",
                "X-Title": "NanoChat Educational",
            }
        )
        print("OpenRouter client initialized.")
    else:
        print("Warning: OPENROUTER_API_KEY not found in .env. Chat will fail.")

# Initialize on startup
init_rag()
init_chat()

# --- Models ---
class ExecuteRequest(BaseModel):
    code: str

import requests

# ...

@app.get("/models")
async def get_models():
    """Fetches available free models from OpenRouter."""
    try:
        resp = requests.get("https://openrouter.ai/api/v1/models")
        if resp.status_code == 200:
            data = resp.json()
            # Filter for free models (usually contain ':free' or price is 0)
            # OpenRouter API returns 'pricing' object.
            # For simplicity, we'll look for ':free' in ID as a heuristic, 
            # and also include some known cheap ones if needed.
            # The user specifically asked for "free filtered models".
            
            all_models = data.get("data", [])
            free_models = [
                m for m in all_models 
                if ":free" in m["id"] or m.get("pricing", {}).get("prompt") == "0"
            ]
            return {"models": free_models}
        return {"models": []}
    except Exception as e:
        print(f"Error fetching models: {e}")
        return {"models": []}

class ChatRequest(BaseModel):
    message: str
    model: str = "google/gemini-2.0-flash-exp:free" # Default
    context_nodes: Optional[List[str]] = None
    viewing_node: Optional[str] = None
    related_nodes: Optional[List[str]] = None

class ChatResponse(BaseModel):
    response: str
    focused_nodes: List[str]
    context_nodes: List[str] = []

# ...

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, authorization: Optional[str] = Header(None)):
    """
    Graph RAG Chat Endpoint using LanceDB.
    """
    query = request.message
    
    # Determine Client to use
    client = OPENROUTER_CLIENT
    # print(f"DEBUG: Received Authorization Header: {authorization[:20] if authorization else 'None'}...")
    
    # Check for User API Key in Header
    if authorization and authorization.startswith("Bearer "):
        user_key = authorization.split(" ")[1]
        if user_key:
            # print("DEBUG: Using User API Key from Header.")
            # Create temporary client for this request
            client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=user_key,
                default_headers={
                    "HTTP-Referer": "http://localhost:8999",
                    "X-Title": "NanoChat Educational (User Key)",
                }
            )

    # Fallback if no API Key available at all
    if not client:
        return ChatResponse(
            response="**Chat Unavailable**: No API Key found. Please connect OpenRouter in Settings or add `OPENROUTER_API_KEY` to `.env`.",
            focused_nodes=[],
            context_nodes=[]
        )
    
    # ===== PHASE 1: Agentic Intent Analysis =====
    # Use LLM to understand user intent and generate optimal RAG query
    intent_prompt = f"""Analyze this user message for a codebase learning assistant and return JSON only.

User message: "{query}"

Return this JSON structure (no markdown, just raw JSON):
{{
  "expertise_level": "beginner|intermediate|expert",
  "rag_query": "optimized search query for semantic retrieval",
  "priority_concepts": ["concept:...", "nanochat/..."]
}}

Guidelines:
- For beginners: rag_query should include "foundational tensors neural network basics"
- priority_concepts: suggest 2-3 most relevant nodes from: concept:foundation.tensors, concept:mlp, concept:attention.self_attention, concept:gpt.model, nanochat/gpt.py
- For experts: focus on specific technical concepts they're asking about
"""

    rag_query = query  # Default fallback
    priority_concepts = []
    
    try:
        print("DEBUG: Phase 1 - Intent Analysis...")
        intent_response = client.chat.completions.create(
            model="google/gemini-2.0-flash-exp:free",  # Fast/cheap model
            messages=[{"role": "user", "content": intent_prompt}],
            max_tokens=200
        )
        intent_text = intent_response.choices[0].message.content.strip()
        
        # Parse JSON (handle potential markdown wrapping)
        if intent_text.startswith("```"):
            intent_text = intent_text.split("```")[1]
            if intent_text.startswith("json"):
                intent_text = intent_text[4:]
        
        intent = json.loads(intent_text)
        rag_query = intent.get("rag_query", query)
        priority_concepts = intent.get("priority_concepts", [])
        expertise = intent.get("expertise_level", "unknown")
        
        print(f"DEBUG: Intent Analysis Result:")
        print(f"  - Expertise: {expertise}")
        print(f"  - RAG Query: {rag_query}")
        print(f"  - Priority Concepts: {priority_concepts}")
        
    except Exception as e:
        print(f"DEBUG: Intent analysis failed, using raw query: {e}")
    
    # ===== PHASE 2: Retrieve Relevant Nodes via LanceDB =====
    relevant_nodes = []
    if RAG_MODEL and TABLE:
        try:
            print(f"DEBUG: RAG Search Query: '{rag_query}'")
            query_embedding = RAG_MODEL.encode([rag_query])[0]
            print("DEBUG: Generated Query Embedding (Qwen).")
            
            # Get more results initially, then filter
            results = TABLE.search(query_embedding).limit(15).to_list()
            print(f"DEBUG: RAG Results (Top 15 before filtering):")
            
            # Prioritize educational content: concepts and core nanochat files
            priority_nodes = []
            secondary_nodes = []
            
            for res in results:
                node_id = res["id"]
                distance = res.get('_distance', 999)
                print(f"  - {node_id} (Distance: {distance})")
                
                # Prioritize: concept:*, nanochat/*.py
                if node_id.startswith("concept:") or node_id.startswith("nanochat/"):
                    priority_nodes.append(node_id)
                # De-prioritize: tasks/*, scripts/*
                elif not node_id.startswith("tasks/") and not node_id.startswith("scripts/"):
                    secondary_nodes.append(node_id)
            
            # Combine: priority first, then secondary, limit to 5
            relevant_nodes = (priority_nodes + secondary_nodes)[:5]
            
            # Inject LLM-suggested priority concepts at the top
            if priority_concepts:
                # Add priority concepts at the front (if they exist in graph)
                valid_priorities = [c for c in priority_concepts if any(n['id'] == c for n in GRAPH_DATA['nodes'])]
                relevant_nodes = valid_priorities + [n for n in relevant_nodes if n not in valid_priorities]
                relevant_nodes = relevant_nodes[:5]  # Keep only top 5
                print(f"DEBUG: Injected LLM priority concepts: {valid_priorities}")
            
            print(f"DEBUG: Final RAG Results: {relevant_nodes}")
            
        except Exception as e:
            print(f"RAG Error: {e}")
            # Continue without context
    
    # 2. Construct System Prompt with RICH context
    context_str = "Relevant Codebase Nodes (use these to guide the user):\n\n"
    for node_id in relevant_nodes:
        node = next((n for n in GRAPH_DATA['nodes'] if n['id'] == node_id), None)
        if node:
            node_type = node.get('type', 'unknown')
            label = node.get('label', node_id)
            docstring = node.get('docstring', '')
            source = node.get('source', 'unknown')
            file_path = node.get('file_path', '')
            
            context_str += f"### {label}\n"
            context_str += f"- **ID**: `{node_id}`\n"
            context_str += f"- **Type**: {node_type}\n"
            context_str += f"- **Source**: {source}\n"
            if file_path:
                context_str += f"- **File**: {file_path}\n"
            if docstring:
                # Truncate long docstrings
                short_doc = docstring[:300] + "..." if len(docstring) > 300 else docstring
                context_str += f"- **Description**: {short_doc}\n"
            context_str += "\n"
    
    # Add viewing context if user is looking at a specific node
    viewing_context = ""
    if request.viewing_node:
        viewing_node = next((n for n in GRAPH_DATA['nodes'] if n['id'] == request.viewing_node), None)
        if viewing_node:
            print(f"DEBUG: User is viewing: {request.viewing_node}")
            viewing_context = f"""
**USER IS CURRENTLY VIEWING**: `{request.viewing_node}`
- Label: {viewing_node.get('label', '')}
- Type: {viewing_node.get('type', '')}
- Description: {viewing_node.get('docstring', 'No description')[:500]}

When the user says "explain this", "what is this", or refers to their current view, explain the node above.
Offer to dig deeper into related concepts or dependencies.
"""
    
    # Add related nodes context
    related_context = ""
    if request.related_nodes and len(request.related_nodes) > 0:
        related_labels = []
        for rel_id in request.related_nodes[:5]:
            rel_node = next((n for n in GRAPH_DATA['nodes'] if n['id'] == rel_id), None)
            if rel_node:
                related_labels.append(f"{rel_node.get('label', rel_id)} (`{rel_id}`)")
        if related_labels:
            related_context = f"\n**RELATED NODES**: {', '.join(related_labels)}\n"
            
    system_prompt = f"""You are 'NanoChat', an expert AI educational assistant for the 'nanochat' codebase.
You have access to a Knowledge Graph of the code.
Your goal is to help users understand the code, regardless of their expertise level.

{context_str}
{viewing_context}
{related_context}

**Core Instructions:**
1. **Assess Expertise**: If the user's question is basic (e.g., "What is this?", "How do I start?"), assume they are a **Beginner**. Explain concepts simply, avoiding jargon where possible, or defining it. If the question is complex, assume **Intermediate/Expert** but remain clear.
2. **New User Detection**: If the user says "hi", "hello", or asks a very general question, welcome them and ask about their background (e.g., "Are you new to Transformers?").
3. **Starting Point**: If the user asks where to start, ALWAYS recommend `nanochat/gpt.py` (The Model Definition) first, as it contains the core logic. Do NOT start with config or utils.
4. **Graph Guidance**: You MUST identify which nodes in the graph are most relevant.
5. **Response Format**: Return JSON with:
   - "response": The text of your answer (markdown supported).
   - "focused_nodes": A list of node IDs to highlight.

**Persona**:
- Friendly, encouraging, and educational.
- "Conversational Assistance Mode": Actively suggest the next logical step or concept to learn.

Example JSON:
{{
  "response": "Welcome! Since you're new, let's start with `nanochat/gpt.py`. It contains the main `GPT` model definition and is the heart of the codebase.",
  "focused_nodes": ["nanochat/gpt.py"]
}}
"""

    # 3. Call LLM
    try:
        # print(f"DEBUG: Calling OpenRouter with Model: {request.model}")
        # print(f"DEBUG: Using API Key: {client.api_key[:10]}...{client.api_key[-4:]}")
        # print(f"DEBUG: Client Headers: {client.default_headers}")
        
        messages_payload = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query}
        ]
        
        print(f"DEBUG: LLM Request Messages:\n{json.dumps(messages_payload, indent=2)}")

        completion = client.chat.completions.create(
            model=request.model,
            messages=messages_payload,
            response_format={"type": "json_object"}
        )

        
        content = completion.choices[0].message.content
        try:
            result = json.loads(content)
            print(f"DEBUG: LLM Response JSON:\n{json.dumps(result, indent=2)}")
        except json.JSONDecodeError:
            # Fallback if model doesn't return valid JSON
            return ChatResponse(
                response=content,
                focused_nodes=[],
                context_nodes=[]
            )
        
        valid_ids = set(n['id'] for n in GRAPH_DATA['nodes'])
        safe_focused = [nid for nid in result.get("focused_nodes", []) if nid in valid_ids]
        
        # Filter relevant_nodes to ensure they are valid and not already in focused
        safe_context = [nid for nid in relevant_nodes if nid in valid_ids and nid not in safe_focused]
        
        return ChatResponse(
            response=result.get("response", "I couldn't generate a response."),
            focused_nodes=safe_focused,
            context_nodes=safe_context
        )
        
    except Exception as e:
        print(f"LLM Error: {e}")
        return ChatResponse(
            response=f"**Error**: Failed to contact AI provider. ({str(e)})",
            focused_nodes=[],
            context_nodes=[]
        )

if __name__ == "__main__":
    print("Starting NanoChat Bridge on http://localhost:8999")
    uvicorn.run(app, host="0.0.0.0", port=8999)
