# Causal Self-Attention

Self-attention is the core mechanism of the Transformer. It allows the model to weigh the importance of different tokens in the sequence when processing a specific token.

## Causal Masking
In a decoder-only model like GPT, attention is "causal", meaning a token can only attend to previous tokens (and itself), not future tokens. This is enforced by a triangular mask.

## Components
- **Query (Q)**: What I am looking for.
- **Key (K)**: What I contain.
- **Value (V)**: What I pass along if I am attended to.

The attention score is calculated as:
$$
\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V
$$
