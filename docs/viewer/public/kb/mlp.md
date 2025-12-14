# Multilayer Perceptron (MLP)

The MLP (or Feed-Forward Network) processes the information gathered by the attention mechanism. It is applied position-wise (independently to each token).

## Architecture
In this implementation, we use a specific variant:
1.  **Expansion**: Project from `n_embd` to `4 * n_embd`.
2.  **Activation**: Apply ReLU and square it (`ReLU^2`).
3.  **Projection**: Project back to `n_embd`.

## ReLU^2
Squared ReLU is a variant of ReLU that has been shown to improve convergence in some LLMs. It provides a smoother gradient than standard ReLU.
