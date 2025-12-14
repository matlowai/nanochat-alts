# NanoChat Educational Layer Setup 🎓

Welcome to the NanoChat interactive learning platform! Follow these steps to set up the environment, including the Chat Agent and Graph Viewer.

## 1. Environment Setup

You need to configure API keys for the AI features to work.

1.  **Copy the Example Config**:
    ```bash
    cp .env.example .env
    ```

2.  **OpenRouter API Key** (Required for Chat Agent):
    - Sign up at [OpenRouter](https://openrouter.ai/).
    - Create a key and paste it into `.env` as `OPENROUTER_API_KEY`.
    - *Note: You can use free models like `mistralai/devstral-2512:free`!*

3.  **Hugging Face Token** (Required for Embeddings):
    - We use `Qwen/Qwen3-Embedding-0.6B` from Hugging Face.
    - Get a User Access Token (Read) from [Hugging Face Settings](https://huggingface.co/settings/tokens).
    - Paste it into `.env` as `HF_TOKEN`.
    - *This ensures the bridge can automatically download the model.*

## 2. Running the Platform

1.  **Install Dependencies**:
    ```bash
    # Install Python dependencies
    uv sync
    
    # Install Frontend dependencies
    cd docs/viewer
    bun install
    ```

2.  **Start the Bridge & Viewer**:
    ```bash
    # In docs/viewer directory:
    bun run dev
    ```
    This command will:
    - Generate the Knowledge Graph (`generate-graph`).
    - Start the Vite frontend.
    - *Note: You need to run the bridge separately for the Chat Agent.*

3.  **Start the Runtime Bridge** (For Chat & Execution):
    Open a new terminal:
    ```bash
    cd docs/viewer
    bun run start-bridge
    ```
    - The first run will download the embedding model (may take a few minutes).
    - Once running, the "Chat" and "Run Code" features in the viewer will be active.

## 3. Features

- **Interactive Graph Viewer**: Explore the codebase as a knowledge graph.
- **Chat Agent (NanoChat AI)**: Ask questions about the code in natural language.
- **Draggable Chat Window**: Position the chat anywhere on screen.
- **Chat History**: Conversations are automatically saved to IndexedDB. Access past chats via the "History" toggle in the top-left.
- **Focus Mode**: Click nodes in "Suggested Focus" to center the camera and see neighbors.

## 4. Troubleshooting

- **Bridge Connection Failed**: Ensure `bun run start-bridge` is running on port 8999.
- **Model Download Error**: Check your `HF_TOKEN` in `.env`.
- **Chat Error**: Check your `OPENROUTER_API_KEY` and ensure you have credits (or are using a free model).
