# RMSNorm (Root Mean Square Normalization)

RMSNorm is a simplification of LayerNorm that re-scales the input based on the root mean square of its values, without centering (subtracting the mean).

## Formula
$$
\text{RMSNorm}(x) = \frac{x}{\sqrt{\frac{1}{d} \sum_{i=1}^d x_i^2 + \epsilon}} \cdot \gamma
$$
where $\gamma$ is a learnable gain parameter (though in this implementation, we might use a fixed scale or no learnable params for the norm itself, relying on the following layers).
