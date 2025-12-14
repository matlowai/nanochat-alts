# Rotary Positional Embeddings (RoPE)

RoPE encodes positional information by rotating the query and key vectors in the complex plane.

## Why RoPE?
Unlike absolute positional embeddings (added to the input), RoPE captures *relative* positions naturally. The dot product between two rotated vectors depends only on their relative distance, not their absolute positions.

## Implementation
We apply the rotation to pairs of dimensions in the query and key vectors before computing attention scores.
