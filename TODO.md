# NanoChat Educational Layer - Project Roadmap 🗺️

This document tracks the remaining work to transform `nanochat` into a "Zero to Hero" interactive learning platform.

## 🔴 Phase 1: Content Filling ("Extreme Notes")
*Goal: Ensure every major concept in the code has a corresponding Knowledge Base article.*

### Foundation & Tokenization
- [x] **Tensors & Shapes**: Explain broadcasting, views, and strides.
- [x] **The Tokenizer**: Deep dive into BPE, Vocab Size, and `tiktoken` vs `rustbpe`.

### Architecture (`gpt.py`)
- [x] **Rotary Embeddings (RoPE)**: Visual explanation of rotation.
- [x] **RMSNorm**: Math breakdown vs LayerNorm.
- [x] **Group Query Attention (GQA)**: Memory bandwidth savings.
- [x] **SwiGLU**: The "Gate" mechanism in MLPs.
- [x] **Logit Softcapping**: Stability trick explanation.

### Optimization (`muon.py`, `base_train.py`)
- [x] **Muon Optimizer**: How it orthogonalizes updates (Newton-Schulz).
- [x] **Distributed Data Parallel (DDP)**: Ranks, World Size, All-Reduce.
- [x] **Gradient Accumulation**: Simulating large batch sizes.
- [x] **Mixed Precision**: BF16 vs FP32.

### Inference (`engine.py`)
- [x] **KV Cache**: Circular buffer visualization.
- [x] **Speculative Decoding**: Acceptance/Rejection sampling.

## 🟠 Phase 2: Visualization Engine
*Goal: Make the "Concept Panel" alive with interactive graphics.*

- [x] **Viz Infrastructure**:
    - [x] Create `docs/viewer/src/viz/` registry.
    - [x] Implement `<VizContainer />` component in React.
- [ ] **Core Visualizations**:
    - [x] **Matrix Multiplication**:
        - [x] Placeholder component.
        - [x] Interactive Grid View (HTML/CSS).
        - [x] Hover effects to show Row x Col = Cell.
    - [x] **Softmax**:
        - [x] Bar chart of Logits vs Probabilities.
        - [x] Temperature Slider.
    - [ ] **Attention Pattern**: Heatmap showing token-to-token affinity.
    - [ ] **RoPE Rotation**: 2D circle animation of rotating vectors.
- [ ] **Integration**:
    - [x] Update `App.jsx` to render visualizations when `@viz` tags are clicked.

## 🟡 Phase 3: Chat Agent & RAG 💬
*Goal: A helpful AI pair programmer that knows the codebase.*

- [ ] **Basic Chat Integration**:
    - [x] **Fix Bridge Endpoint**: Debug 500 error on `/chat`.
    - [x] **OpenRouter Setup**: Ensure API key is loaded correctly.
    - [x] **Model Selector**: Dropdown to pick free models (fix 429 errors).
    - [x] **Adaptive System Prompt**: Detect user expertise and guide new users.
    - [x] **Welcome Message**: Initial greeting to prompt user interaction.
    - [x] **Settings Menu**: Manual API Key entry + OpenRouter OAuth login.
- [ ] **RAG Integration**:
    - [ ] **Context Retrieval**: Query LanceDB for relevant nodes.
    - [ ] **Prompt Engineering**: Inject retrieved context into the system prompt.
    - [ ] **Citations**: Show which files/concepts were used to answer.
- [ ] **Tool Use (Future)**:
    - [ ] **Code Execution**: Allow agent to run snippets via `/execute`.
    - [ ] **Graph Navigation**: Allow agent to highlight nodes in the UI.

## 🔵 Phase 4: Activation Tracing (The "Magic")
*Goal: Visualize the actual data flowing through the model.*

- [ ] **Python Backend**:
    - [ ] Implement `TraceContext` manager in `nanochat/utils.py`.
    - [ ] Add hook support to `GPT` model.
    - [ ] Create `/trace` endpoint in `bridge.py`.
- [ ] **Frontend Viewer**:
    - [ ] Add "Trace Mode" to the viewer.
    - [ ] Visualize attention scores.

## 🟢 Phase 5: Polish & Deployment
*Goal: Make it ready for public consumption.*

- [ ] **UI/UX**:
    - [ ] Search Bar for finding concepts/files.
    - [ ] Mobile-responsive layout.
    - [ ] "Tour" mode for new users.
- [ ] **Deployment**:
    - [ ] Dockerfile for the Bridge + Viewer.
    - [ ] Hosting guide (e.g., Vercel + Railway).

## ✅ Completed
- [x] **Infrastructure**:
    - [x] Knowledge Graph Indexer (`generate_code_index.py`).
    - [x] Web Viewer (React + D3.js).
    - [x] Runtime Bridge (FastAPI).
- [x] **AI Agent**:
    - [x] Graph RAG with LanceDB.
    - [x] "Chunk by Function" embedding strategy.
    - [x] Chat Panel with Node Highlighting.
