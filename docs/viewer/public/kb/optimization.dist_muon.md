# Distributed Muon

An implementation of Muon optimized for Distributed Data Parallel (DDP) training.

## Strategy
To save memory and communication:
1.  **Reduce-Scatter**: Gradients are averaged across ranks, but the result is scattered (sharded) so each rank only holds a chunk of the averaged gradients.
2.  **Shard Computation**: Each rank computes the Muon update (Newton-Schulz) for its assigned chunk of parameters.
3.  **All-Gather**: The updated parameters are gathered back to all ranks.

This avoids storing the full momentum buffer on every rank.
