# Transformer Block

A single layer of the Transformer architecture.

## Structure
$$
x = x + \text{Attention}(\text{Norm}(x))
x = x + \text{MLP}(\text{Norm}(x))
$$

## Components
- **Pre-Normalization**: Norm is applied *before* the sub-layer (Attention/MLP).
- **Residual Connections**: The input $x$ is added back to the output of the sub-layer ($x + \dots$). This is crucial for training deep networks as it allows gradients to flow through the network easily.
