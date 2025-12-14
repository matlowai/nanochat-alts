# Architecture Design: NanoChat Educational Layer

## Goal
Transform the `nanochat` repository into a "Zero to Hero" interactive learning platform for LLMs.
Target Audience: Beginners with some math background but 0 ML/Coding experience.

## 1. The "Extreme Notes" System

We need a way to attach rich educational content to specific parts of the codebase without making the code unreadable.

### Annotation Specification (for Agents & Humans)
To ensure auto-indexing works, all code additions must follow this notation:

1.  **Concept Tags**: Use `# @learn:concept_id` to link a line or block to a concept.
    ```python
    # @learn:attention.self_attention
    y = F.scaled_dot_product_attention(...)
    ```
2.  **Definition Blocks**: For defining a concept in-place (if brief):
    ```python
    # @def:attention.self_attention
    # Self-attention allows the model to weigh the importance of different words...
    ```
3.  **Visualization Links**: Link to a standalone interactive visualization.
    ```python
    # @viz:attention.matrix_heatmap
    ```
4.  **Todo Markers**: Explicitly mark missing explanations.
    ```python
    # @todo:explain:why_is_this_here
    ```

### Storage Strategy: Hybrid Approach
1.  **In-Code Anchors**: The source of truth for *where* concepts apply.
2.  **Knowledge Base**: `docs/knowledge_base/` for deep dives.
3.  **Gap Analysis**: The indexer will report:
    - Concepts used in code but missing in KB.
    - Concepts in KB but never referenced in code.
    - `@todo:explain` tags.

## 2. Interactive Index Architecture

A web-based interactive knowledge base (Graph > Linear).

### Components
1.  **Indexer Script (`scripts/generate_code_index.py`)**:
    - Scans `nanochat/` for `@learn`, `@def`, `@viz` tags.
    - **Granular Indexing**: Recursively extracts **Functions** and **Classes** as individual nodes, capturing their docstrings.
    - **Rich Metadata**: Captures `file_path`, `source` (repo/external), and `library` for every node.
    - Generates `knowledge_graph.json` (Nodes=Concepts/Files/Functions, Edges=Dependencies/Links).
    - **Gap Report**: Outputs a list of missing content.
2.  **Web Viewer (React/Vite + D3.js)**:
    - **Graph View**: Force-directed graph of concepts.
    - **Code View**: Syntax-highlighted code with clickable `@learn` tags.
    - **Concept Panel**: Markdown rendering + Embedded Visualizations.
    - **Visualization Engine**:
        - Web-based (Canvas/WebGL) for performance.
        - "Standalone Snippets": Small, runnable JS/WASM modules that visualize specific math (e.g., Matrix Multiplication, Softmax).

## 4. Runtime Bridge & Graph RAG Agent
The "Magic" Link that connects the static code to dynamic execution and AI assistance.

### 4.1. Local Bridge Server (`scripts/bridge.py`)
A lightweight **FastAPI** server that runs locally alongside the viewer.
- **Role**: Acts as the backend for the static React app.
- **Capabilities**:
    1.  **Code Execution**: Receives Python code from the viewer, executes it locally, and returns `stdout`/`stderr`.
    2.  **Graph RAG**: Hosts the RAG pipeline for the Chat Agent.

### 4.2. Graph RAG Architecture
To enable "Chat with Codebase", we use a Retrieval-Augmented Generation system grounded in the Knowledge Graph.

1.  **Vector Store (LanceDB)**:
    - We use **LanceDB** for local, serverless vector storage.
    - **Schema Definition**:
        - `id` (str): Unique identifier (e.g., `nanochat/gpt.py:GPT`).
        - `text` (str): The rich text representation used for embedding.
        - `vector` (float32[]): The embedding vector (dimension depends on model).
        - `type` (str): Node type (`function`, `class`, `file`, `concept`).
        - `label` (str): Human-readable name (e.g., `GPT`).
        - `source` (str): Origin of the code (`repo` or `external`).
        - `library` (str, optional): The library name if external (e.g., `torch`).
        - `file_path` (str): Relative path to the defining file.
        - `docstring` (str): Extracted documentation/docstring.
    - **Dynamic Indexing**: Supports adding new content on the fly via `/index` endpoint.

2.  **Embeddings (Qwen)**:
    - **Model**: [`Qwen/Qwen3-Embedding-0.6B`](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) from Hugging Face.
    - **Specs**:
        - **Context Length**: 32,000 tokens (32k).
        - **MTEB Score**: ~70.70 (Overall), beating many larger models.
        - **MRL Support**: Supports Matryoshka Representation Learning (truncation), but we use the **full dimension** for maximum accuracy.
    - **Strategy**: "Chunk by Function". Instead of naive file chunking, we embed:
      ```text
      Type: Function
      Name: forward
      Source: repo
      File: nanochat/gpt.py
      Description: [Docstring content...]
      ```
    - This ensures queries like "Where is the forward pass?" map directly to the function node.

3.  **Chat Agent**:
    - **LLM Provider**: OpenRouter.
    - **Model Selection**: Configured to prioritize free or experimental models using the `:free` tag (e.g., `mistralai/devstral-2512:free`, `google/gemini-2.0-flash-exp:free`).
    - **Flow**:
        1.  User asks question.
        2.  Bridge embeds query and searches LanceDB for top-k relevant nodes.
        3.  Bridge constructs prompt with node context (Name, Type, ID).
        4.  LLM generates response + **Focused Nodes** (JSON).
        5.  Viewer displays response and **Highlights** the focused nodes in the graph.

### 4.3. Activation Visualization (Planned)
Future extension to visualize internal model state.
1.  **`TraceContext`**: A context manager to capture tensors.
2.  **Export**: Save traces as JSON/Binary for the viewer to replay.

## 5. "Zero to Hero" Knowledge Graph

Instead of a linear curriculum, we define clusters of concepts:

1.  **Cluster: Foundations** (Tensors, Shapes, Dot Product)
2.  **Cluster: Tokenization** (BPE, Vocab, Unicode)
3.  **Cluster: Architecture** (Transformer, Attention, MLP, Norms)
4.  **Cluster: Optimization** (Loss, Backprop, AdamW, Muon)
5.  **Cluster: Inference** (KV Cache, Sampling, Logits)

## 4. Gaps to Fill (Immediate Actions)

### Knowledge Base Content Needed
We need to write "Extreme Notes" for the following concepts found in the code:

**Foundational (Module 0-1)**
- [ ] Tensors, Shapes, and Broadcasting
- [ ] The Tokenizer (BPE, Vocab Size)

**Architecture (Module 2 - `gpt.py`)**
- [ ] **Rotary Embeddings (RoPE)**: How `apply_rotary_emb` works.
- [ ] **RMSNorm**: Why it differs from LayerNorm.
- [ ] **Group Query Attention (GQA)**: Efficiency vs Performance.
- [ ] **SwiGLU / ReLU^2**: The activation function used in `MLP`.
- [ ] **Logit Softcapping**: Why we squash logits before loss.

**Optimization (Module 3 - `muon.py`, `base_train.py`)**
- [ ] **Distributed Data Parallel (DDP)**: Ranks, World Size.
- [ ] **Gradient Accumulation**: Simulating large batches.
- [ ] **Muon Optimizer**: The custom optimizer used for matrices.
- [ ] **Newton-Schulz Iteration**: How Muon orthogonalizes updates.
- [ ] **Mixed Precision (BF16)**: Why we use it.
- [ ] **Chinchilla Scaling**: How we decide `num_iterations`.

**Inference & Tools (Module 4 - `engine.py`, `execution.py`)**
- [ ] **KV Cache**: Pre-allocation and Circular Buffers.
- [ ] **Speculative Decoding**: (If applicable, or just standard sampling).
- [ ] **Tool Use State Machine**: Handling `<|python_start|>` tokens.
- [ ] **Sandboxing**: How we safely execute generated Python code.

**Data Pipeline (Module 1.5 - `dataloader.py`, `tokenizer.py`)**
- [ ] **Parquet Streaming**: Infinite datasets.
- [ ] **Tiktoken vs RustBPE**: Training vs Inference efficiency.
- [ ] **Special Tokens**: Control tokens for chat/tools.

### Infrastructure
- [ ] **Tagging the Code**: Add `@learn:` tags to `gpt.py` and `base_train.py`.
- [ ] **Viewer Implementation**: Build the `index.html` and `app.js`.
