# GPT Configuration

The `GPTConfig` dataclass defines the hyperparameters for the model.

## Key Parameters

- **sequence_len**: Maximum context length (e.g., 1024).
- **vocab_size**: Number of tokens in the vocabulary (e.g., 50304).
- **n_layer**: Number of transformer blocks.
- **n_head**: Number of attention heads for queries.
- **n_kv_head**: Number of attention heads for keys/values (used for GQA).
- **n_embd**: Embedding dimension.

## Why Dataclass?
Using a dataclass ensures type safety and easy serialization of configuration.
