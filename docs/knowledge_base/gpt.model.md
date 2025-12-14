# GPT Model

The `GPT` class is the top-level container for the Large Language Model.

## Responsibilities
1.  **Embeddings**: Converts token IDs to vectors (`wte`).
2.  **Transformer Blocks**: Processes vectors through $N$ layers of attention and MLPs.
3.  **Normalization**: Applies final RMSNorm.
4.  **Language Head**: Projects final vectors back to vocabulary size to predict the next token.
5.  **Weight Initialization**: Sets initial parameter values for stable training.
