# Newton-Schulz Iteration

Newton-Schulz iteration is an iterative method to find the inverse square root or orthogonalization of a matrix without explicitly computing eigenvalues or SVD.

## In Muon
We use it to compute the "zeroth power" of the gradient matrix $G$, effectively projecting it onto the manifold of orthogonal matrices.
$$
\text{Orthogonalize}(G) \approx U V^T
$$
where $G = U \Sigma V^T$.

## Quintic Iteration
We use a specific quintic (5th order) polynomial iteration that converges faster than the standard cubic iteration, allowing us to use fewer steps (e.g., 5) for efficiency.
