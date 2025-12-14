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
    global MODEL_CONTEXT_CACHE
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
            
            # Cache context_length for all models
            for model in all_models:
                model_id = model.get("id")
                context_length = model.get("context_length") or model.get("top_provider", {}).get("context_length")
                if model_id and context_length:
                    MODEL_CONTEXT_CACHE[model_id] = context_length
            
            print(f"DEBUG: Cached context sizes for {len(MODEL_CONTEXT_CACHE)} models")
            return {"models": free_models}
        return {"models": []}
    except Exception as e:
        print(f"Error fetching models: {e}")
        return {"models": []}

# --- Token Counting & Context Budget ---

# Cache for model context sizes (populated from /models endpoint)
MODEL_CONTEXT_CACHE = {}
DEFAULT_CONTEXT_SIZE = 32768

def get_model_context(model_id: str) -> int:
    """Get context size for a model from cache or default."""
    return MODEL_CONTEXT_CACHE.get(model_id, DEFAULT_CONTEXT_SIZE)

def estimate_tokens(text: str) -> int:
    """Rough token estimation: ~4 chars per token for English text."""
    return max(1, len(text) // 4)

class ContextBudgetRequest(BaseModel):
    model: str
    budget_percent: int = 50
    max_tokens: int = 100000

class ContextBudgetResponse(BaseModel):
    model: str
    model_context_size: int
    budget_percent: int
    available_tokens: int
    max_tokens: int

@app.post("/context-budget")
async def get_context_budget(request: ContextBudgetRequest) -> ContextBudgetResponse:
    """Calculate available context budget for a model."""
    model_context = get_model_context(request.model)
    
    # Budget = min(model_context * percent, max_tokens)
    budget_tokens = int(model_context * request.budget_percent / 100)
    available = min(budget_tokens, request.max_tokens)
    
    return ContextBudgetResponse(
        model=request.model,
        model_context_size=model_context,
        budget_percent=request.budget_percent,
        available_tokens=available,
        max_tokens=request.max_tokens
    )

@app.get("/model-context/{model_id:path}")
async def get_model_context_size(model_id: str):
    """Get context window size for a specific model."""
    size = get_model_context(model_id)
    return {"model": model_id, "context_size": size}

class ChatRequest(BaseModel):
    message: str
    model: str  # Required - no defaults
    context_nodes: Optional[List[str]] = None
    viewing_node: Optional[str] = None
    related_nodes: Optional[List[str]] = None
    learner_profile: Optional[dict] = None
    context_settings: Optional[dict] = None
    conversation_memory: Optional[dict] = None  # {fullTurns, summaryTurns}
    injected_context: Optional[List[dict]] = None  # [{id, content}] for rehydrated turns

class ChatResponse(BaseModel):
    response: str
    focused_nodes: List[str]
    context_nodes: List[str] = []
    token_usage: Optional[dict] = None
    retrieve_context: Optional[List[str]] = None  # IDs for frontend to fetch
    profile_updates: Optional[dict] = None  # Updates to learner profile

# --- Compression Endpoint ---
# DESIGN PRINCIPLES (DO NOT VIOLATE):
# 1. NO max_tokens - Let the LLM decide output length. max_tokens causes hard truncation.
# 2. NO hardcoded models - Always use request.model (user's selected model).
# 3. NO heuristic fallbacks - If LLM fails, keep original. No substring/truncation tricks.
# 4. NO content truncation - Show full content everywhere. Use CSS for UI constraints.

class CompressRequest(BaseModel):
    segments: List[dict]  # [{id, content}]
    prompt: str = "Summarize preserving technical details"
    model: str  # Required - no defaults, user must specify

@app.post("/compress")
async def compress_segments(request: CompressRequest, authorization: Optional[str] = Header(None)):
    """
    Compress context segments using LLM only.
    
    IMPORTANT: This endpoint uses LLM compression ONLY.
    - NO max_tokens limit (causes truncation)
    - NO heuristic fallbacks (substring, truncation, etc.)
    - Uses the user's selected model (request.model)
    - If LLM fails or returns invalid result, keep original content
    """
    print(f"DEBUG /compress: Received {len(request.segments)} segments")
    client = OPENROUTER_CLIENT
    
    # Use user API key if provided
    if authorization and authorization.startswith("Bearer "):
        user_key = authorization.replace("Bearer ", "")
        if user_key:
            client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=user_key)
    
    if not client:
        print("DEBUG /compress: No API client - returning originals")
        return {"compressed": [{"id": s.get("id"), "content": s.get("content", ""), "tokenCount": estimate_tokens(s.get("content", "")), "isCompacted": False} for s in request.segments]}
    
    compressed = []
    for segment in request.segments:
        seg_id = segment.get("id")
        seg_content = segment.get("content", "")
        print(f"DEBUG /compress: Processing segment '{seg_id}' ({len(seg_content)} chars)")
        
        # Skip empty or very short content (nothing to compress)
        if not seg_content or len(seg_content) < 50:
            print(f"DEBUG /compress: Skipping '{seg_id}' - too short")
            compressed.append({
                "id": seg_id,
                "content": seg_content,
                "tokenCount": estimate_tokens(seg_content) if seg_content else 1,
                "isCompacted": False
            })
            continue
        
        # LLM compression - NO max_tokens (causes truncation), NO heuristics
        try:
            llm_messages = [
                {"role": "system", "content": "Compress to ~50%. Return ONLY compressed text, nothing else."},
                {"role": "user", "content": seg_content}
            ]
            
            print(f"DEBUG /compress REQUEST:")
            print(f"  Model: {request.model}")
            print(f"  Full user content:\n{seg_content}")
            print(f"  --- END CONTENT ---")
            
            # NOTE: No max_tokens! Let the LLM decide how much to output.
            # max_tokens causes hard truncation which is not intelligent compression.
            response = client.chat.completions.create(
                model=request.model,  # Always use user's selected model, never hardcode
                messages=llm_messages
            )
            
            print(f"DEBUG /compress RESPONSE (full object):")
            print(f"  {response}")
            print(f"  --- END RESPONSE ---")
            
            if response.choices and len(response.choices) > 0:
                choice = response.choices[0]
                print(f"DEBUG /compress CHOICE details:")
                print(f"  finish_reason: {choice.finish_reason}")
                print(f"  message: {choice.message}")
                print(f"  message.content (repr): {repr(choice.message.content)}")
                print(f"  message.content (str): {str(choice.message.content)}")
            
            if response.choices and response.choices[0].message and response.choices[0].message.content:
                summary = response.choices[0].message.content.strip()
                # Must be at least 10 chars and shorter than original
                if summary and len(summary) >= 10 and len(summary) < len(seg_content):
                    print(f"DEBUG /compress: LLM compressed '{seg_id}' from {len(seg_content)} to {len(summary)} chars ({len(summary)*100//len(seg_content)}%)")
                    compressed.append({
                        "id": seg_id,
                        "content": summary,
                        "tokenCount": estimate_tokens(summary),
                        "isCompacted": True
                    })
                else:
                    print(f"DEBUG /compress: LLM returned invalid result for '{seg_id}' (len={len(summary) if summary else 0}), keeping original")
                    compressed.append({
                        "id": seg_id,
                        "content": seg_content,
                        "tokenCount": estimate_tokens(seg_content),
                        "isCompacted": False
                    })
            else:
                print(f"DEBUG /compress: LLM returned empty for '{seg_id}', keeping original")
                compressed.append({
                    "id": seg_id,
                    "content": seg_content,
                    "tokenCount": estimate_tokens(seg_content),
                    "isCompacted": False
                })
        except Exception as e:
            print(f"DEBUG /compress: LLM failed for '{seg_id}': {e}, keeping original")
            compressed.append({
                "id": seg_id,
                "content": seg_content,
                "tokenCount": estimate_tokens(seg_content),
                "isCompacted": False
            })
    
    print(f"DEBUG /compress: Returning {len(compressed)} compressed segments")
    return {"compressed": compressed}

# --- Chat Endpoint ---
# DESIGN PRINCIPLES (DO NOT VIOLATE):
# 1. NO max_tokens on LLM calls - Let the LLM decide output length.
# 2. NO hardcoded models - Always use request.model for ALL LLM calls.
# 3. NO content truncation - Show full docstrings, full conversation history.
# 4. Use request.model for intent analysis, main chat, and any other LLM calls.

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
            model=request.model,  # Use selected model
            messages=[{"role": "user", "content": intent_prompt}]
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
                context_str += f"- **Description**: {docstring}\n"
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
- Description: {viewing_node.get('docstring', 'No description')}

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
    
    # Build learner profile context
    learner_context = ""
    if request.learner_profile:
        profile = request.learner_profile
        expertise = profile.get('expertise_level', 'beginner')
        topics = profile.get('topics', {})
        if topics:
            topic_list = [f"{k} (confidence: {v.get('confidence', 0):.1f})" for k, v in list(topics.items())[:5]]
            learner_context = f"""
**LEARNER PROFILE**:
- Expertise: {expertise}
- Topics Discussed: {', '.join(topic_list) if topic_list else 'None yet'}
- Notes: {profile.get('general_notes', 'New user')}
"""
    
    # Build conversation memory context
    memory_context = ""
    if request.conversation_memory:
        memory = request.conversation_memory
        full_turns = memory.get('fullTurns', [])
        summary_turns = memory.get('summaryTurns', [])
        
        if full_turns or summary_turns:
            memory_context = "\n**CONVERSATION HISTORY**:\n"
            
            # Add summaries first (older turns)
            if summary_turns:
                memory_context += "*Previous context (summarized):*\n"
                for turn in summary_turns[-6:]:  # Last 6 summaries
                    memory_context += f"  - [{turn.get('role')}] {turn.get('summary', '')}\n"
            
            # Add full text turns (recent)
            if full_turns:
                memory_context += "\n*Recent conversation:*\n"
                for turn in full_turns[-6:]:  # Last 6 full turns
                    content = turn.get('content', '')
                    memory_context += f"  - [{turn.get('role')}]: {content}\n"
            
            memory_context += "\n"
            
    system_prompt = f"""You are 'NanoChat', an expert AI educational assistant for the 'nanochat' codebase.
You have access to a Knowledge Graph of the code.
Your goal is to help users understand the code, regardless of their expertise level.

{context_str}
{viewing_context}
{related_context}
{learner_context}
{memory_context}

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
