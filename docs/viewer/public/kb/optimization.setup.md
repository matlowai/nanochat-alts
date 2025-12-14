# Optimization Setup

We use a hybrid optimization strategy for training.

## Optimizers
1.  **Muon**: Used for 2D parameters (weights of linear layers). It is a second-order optimizer that orthogonalizes updates.
2.  **AdamW**: Used for 1D parameters (embeddings, norms) and the language head.

## Learning Rate Scaling
We scale the learning rate for AdamW parameters by $1/\sqrt{d_{model}}$ to ensure consistent update magnitudes across different model sizes.
