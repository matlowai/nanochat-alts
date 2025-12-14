# Distributed Data Parallel (DDP) 🤝

## Why DDP?
Training LLMs on a single GPU is slow (or impossible due to memory). **DDP** allows us to train on multiple GPUs simultaneously.

## How it Works
1.  **Replication**: The model is copied to every GPU (Rank).
2.  **Scatter**: The batch of data is split. Each GPU gets a different slice (e.g., Batch Size 8 -> 4 GPUs get 2 samples each).
3.  **Forward/Backward**: Each GPU computes gradients on its own data slice independently.
4.  **All-Reduce**: The magic step. The gradients from all GPUs are averaged together.
5.  **Update**: Every GPU updates its weights using the *averaged* gradients.

Result: The models stay perfectly in sync!

## Key Terms
- **Rank**: The ID of the process (GPU). 0 to N-1.
- **World Size**: Total number of GPUs.
- **Local Rank**: The ID of the GPU on the *current node* (machine).
- **Master Process**: Usually Rank 0. It handles logging, saving checkpoints, etc.

## In NanoChat
We use `torch.distributed` to handle DDP.

```python
# Setup
dist.init_process_group(backend='nccl')
ddp_rank = int(os.environ['RANK'])
ddp_world_size = int(os.environ['WORLD_SIZE'])
device = f'cuda:{ddp_local_rank}'

# Wrap Model
model = DDP(model, device_ids=[ddp_local_rank])
```

> [!NOTE]
> `nccl` (NVIDIA Collective Communications Library) is the backend used for fast GPU-to-GPU communication.
