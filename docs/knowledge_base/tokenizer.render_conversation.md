# Render Conversation

This function converts a structured conversation (list of messages) into a flat sequence of token IDs for the model.

## Chat Template
It applies the chat template logic:
1.  Wraps user messages in `<|user_start|>` ... `<|user_end|>`.
2.  Wraps assistant messages in `<|assistant_start|>` ... `<|assistant_end|>`.
3.  Handles tool calls (Python code) and outputs with their respective special tokens.

## Masking
It also generates a **loss mask**, ensuring that the model is only trained to predict the Assistant's output (and tool calls), not the User's messages.
