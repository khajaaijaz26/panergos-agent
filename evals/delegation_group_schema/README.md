# Delegation grouping schema receipts

`probe.py TREE OUTPUT [--independent]` assembles real eager CLI tool definitions
in a fresh, credential-free temporary home with networking forbidden. Run it
in separate interpreters against base and fix with the same arguments.
Requires `tiktoken` (`o200k_base`); counts use compact OpenAI function JSON.
This measures schema footprint, not model quality or billed savings.

Base: `b2aa855b626ff8688eb34b95c60ee8b6a4af3679`.

| Policy | Base delegate tokens | Fixed delegate tokens | Change |
| --- | ---: | ---: | ---: |
| Default off | 927 | 826 | -101 |
| Explicit on | 927 | 913 | -14 |

Only `delegate_task` changed in either same-config comparison. Total eager
CLI schemas were 7586 → 7485 (off), 7586 → 7572 (on). The field remains
available when enabled; its parameter schema is unchanged. Repeated assembly
is byte-stable. The two invariants also check static/previous schema immutability,
legacy task normalization, and grouped/ungrouped delivery partitioning.
The default-off exposure assertion failed on base before implementation.
