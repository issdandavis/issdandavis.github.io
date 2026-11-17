# Open questions

## Representation

1. Is `beta_H` a scalar, a per-tier scalar, a vector, a matrix, or a local operator?
2. Are digits binary, balanced ternary, or redundant signed digits?
3. What admissibility rule chooses one canonical representation when a non-integer base has alternatives?
4. Is the radial value intended as an exact code, a task feature, or a physical voltage/phase target?

## Sweep

5. What exactly counts as moving from `0 -> 1`, `1 -> 2`, and so on: numerical interpolation, bit-prefix growth, or a path through cells?
6. Does the reverse sweep invert the forward sweep or create a second observation?
7. When starting from every bit, how are conflicting receipts ordered?
8. Does the leading `1` constrain cyclic order, numerical significance, or causal arrival time?

## Occupancy and field

9. What neighborhood and exclusion radius define a collision?
10. When a proposal collides, is phase rotated, direction reflected, or the proposal discarded?
11. Does a claimed cell remain immutable, decay, or transfer charge?
12. What stops the process when no legal cells remain?
13. Does the next field consume the settled sheet, its receipt graph, or an aggregate?
14. Are the programmable “wind” parameters fixed, optimized, or learned?

## Evaluation

15. What first task should the system solve: collision-free allocation, exact retrieval, routing, sequence memory, or classification?
16. What unchanged baseline should be beaten?
17. What matched random/shuffled control has equal state and compute?
18. Which metric has authority when occupancy and task accuracy disagree?
19. How many seeds are affordable beyond the minimum three?
20. What result would stop the architecture rather than trigger another layer?
