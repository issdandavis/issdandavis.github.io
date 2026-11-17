# Research brief: hardware-defined radix lattice

## Verdict

The ingredients are real. The full composition is not yet validated.

Generalized radix, signed-digit arithmetic, digit-serial and systolic flow, cyclic permutation, hard-exclusion placement, lattice dynamics, reservoir computing, wave-based recurrent computation, and programmable couplings all have primary-source precedents. Several pairs and triples have also been combined. The defensible research candidate is the exact integration contract: preserve canonical byte identity while a hardware-defined radix view moves through bidirectional, phase-offset, exclusion-gated sweeps and a declared coupling field.

The proposed hardware measurement is written `dH_hw`; the dimensionless positional value derived from its calibration receipt is `beta_H`. This avoids silently colliding with SCBE's existing `d_H`, which means Poincaré distance, and avoids raising a quantity with physical units directly to positional powers.

This bounded search found no primary source for that entire contract in one system. That is a `NEW_CANDIDATE`, not a patent-novelty conclusion.

## Closest established mechanisms

### Generalized and signed radix

Rényi formalized expansions in non-integer bases. Avižienis showed that redundant signed digits can bound carry propagation and support parallel arithmetic. These results justify exploring a hardware-selected positional view, but they also impose a boundary: arbitrary bases do not automatically produce unique, finite, reversible encodings.

- Rényi (1957): https://static.renyi.hu/renyi_cikkek/1957_representations_for_real_numbers_and_their_ergodic_properties.pdf
- Avižienis (1961): https://doi.org/10.1109/TEC.1961.5219227
- Frougny, Pelantová, and Svobodová (2011): https://arxiv.org/abs/1102.5683

### Moving bit and digit planes

Systolic arrays move operands rhythmically through local processing elements. Bit-serial engines exchange precision for cycles and wiring flexibility. This matches the “two lines passing through one another” intuition more closely than two's-complement arithmetic does.

- Kung and Leiserson (1978): https://www.eecs.harvard.edu/htk/static/files/1978-cmu-cs-report-kung-leiserson.pdf
- BISMO (2018): https://arxiv.org/abs/1806.08862

### Rotation and binding

Circular convolution and coordinate permutations can bind roles and encode order in fixed-width distributed vectors. The operations are useful controls for a phase-offset implementation, but bundled recovery is approximate; it is not automatically a lossless byte codec.

- Plate (1995): https://doi.org/10.1109/72.377968
- Sahlgren, Holst, and Kanerva (2008): https://ri.diva-portal.org/smash/get/diva2%3A1042478/FULLTEXT01.pdf

### Non-colliding placement

Poisson-disk sampling and random sequential adsorption accept candidates only when they respect a minimum separation. They are close to “first non-colliding position wins,” but they do not guarantee full occupancy. Order matters, rejections occur, and the process can jam with unusable holes.

- Bridson (2007): https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf
- Feder (1980): https://doi.org/10.1016/0022-5193(80)90358-6

### Wake, medium, and controlled wind

Lattice-gas automata demonstrate that local Boolean streaming and collision rules can recover specific macroscopic dynamics when symmetry and conservation conditions are satisfied. Reservoir and wave-based recurrent systems use transient dynamics as a computational substrate. Oscillator Ising machines use phase states and programmable couplings to search energy landscapes. These are useful analogies and baselines; none implies that an unspecified wake learns or reaches a globally correct state.

- Frisch, Hasslacher, and Pomeau (1986): https://doi.org/10.1103/PhysRevLett.56.1505
- Maass, Natschläger, and Markram (2002): https://doi.org/10.1162/089976602760407955
- Hughes et al. (2019): https://doi.org/10.1126/sciadv.aay6946
- Wang and Roychowdhury (2017): https://arxiv.org/abs/1709.08102

## What appears new enough to test

> Does an ultrametric- or occupancy-gated coupling field improve a declared placement, routing, or retrieval task when exact byte identities are exposed through a hardware-defined radix view and transported through bidirectional digit-serial sweeps?

The novelty candidate is the receipt-preserving composition, not any one primitive and not the claim that a new number system has been invented.

## Relevant local negative result

The existing seeded-offset tournament is mechanically reversible but did not beat its shuffled-binding control. That result does not refute this new field proposal, because the objective and route contract differ, but it rules out treating reversible offsets alone as useful. The ordinary greedy scheduler and shuffled binding therefore remain mandatory controls.

## Failure boundaries

- `beta_H <= 1` does not supply an ordinary expanding positional base.
- Non-integer bases may admit multiple representations; exact inversion needs an admissibility rule or canonical receipt.
- A matrix- or operator-valued `beta_H` makes multiplication order part of the specification.
- Greedy exclusion is order-dependent and can jam before the lattice is full.
- A “winner” may be only a scheduler artifact unless seed and ordering controls are run.
- A field can settle into a local minimum without solving the task.
- Reversible encoding preserves information; it does not create entropy or independent evidence.
- A dynamic substrate needs a readout and evaluator before “learning” has operational meaning.

## Preregistered comparison

Arms:

1. ordinary binary identity + round-robin placement;
2. ordinary binary identity + seeded random hard exclusion;
3. typed `beta_H` view + the same hard exclusion;
4. typed `beta_H` view + phase/coupling field;
5. size-matched shuffled-field control.

Metrics:

- exact byte round-trip;
- accepted placements and overlap violations;
- rejection rate and fill fraction at jamming;
- mean and tail path length;
- wall time, operations, and stored receipt bytes;
- retrieval/routing task score;
- multiple-seed mean, pooled standard deviation, and unchanged baseline.

Promotion rule: no learning claim unless arm 4 beats arms 1 and 5 by at least `2 * pooled_sd`. Otherwise report `UNDERPOWERED`, `NO GAIN`, or the exact mechanical result.
