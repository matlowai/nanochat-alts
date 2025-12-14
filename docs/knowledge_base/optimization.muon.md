# Muon Optimizer

Muon (MomentUm Orthogonalized by Newton-schulz) is a second-order optimizer designed for training large neural networks.

## Mechanism
1.  **Momentum**: It maintains a momentum buffer of gradients (like SGD/Adam).
2.  **Orthogonalization**: Instead of taking a step in the direction of the gradient, it takes a step in the direction of the *orthogonalized* gradient.
3.  **Scaling**: The update is scaled by the spectral radius (implicitly handled by the orthogonalization) and an aspect-ratio preserving factor.

## Why?
Standard optimizers like AdamW treat parameters element-wise. Muon treats 2D parameters (matrices) as holistic linear operators, which can lead to better convergence for Transformers.
