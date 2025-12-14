# Logit Softcapping

Logit softcapping scales the logits (before softmax) to stay within a fixed range (e.g., $[-15, 15]$).

## Formula
$$
\text{logits} = C \cdot \tanh(\frac{\text{logits}}{C})
$$
where $C$ is the softcap value.

## Purpose
This prevents logits from growing too large, which can cause training instability and loss spikes (the "logit drift" problem). It acts as a regularizer.
