# Context capsule: hardware-defined radix lattice

Date: 2026-11-17
Status: research hypothesis, normalized for implementation
Public name: Hardware-Defined Radix Lattice
Formal symbols: `dH_hw` for the calibrated hardware quantity; `beta_H` for a dimensionless radix view derived from it. SCBE already uses `d_H` for hyperbolic distance.

## User intent

Build a computation surface that does not treat a byte as only one flat binary integer. Keep the byte's exact identity, then expose it through a hardware-defined positional scale. Sweep from bit to byte and byte to bit, repeat from every bit origin, and allow phase-offset paths to claim non-colliding cells. A programmable background field—the user's “wind”—changes how paths rotate and settle. The completed sheet becomes the starting state for the next field.

The physical metaphor is a spinning projectile through a medium: the leading state remains coherent, the medium moves around its wake, interference carries information, and a controlled field changes the route. In the technical model, “projectile,” “wake,” and “wind” are not physical claims. They become a token, a local update trace, and a declared bias/coupling field.

## Invariants

1. The canonical byte identity remains available at every stage.
2. A deterministic transform does not create entropy.
3. Every accepted placement records origin, phase, field, and rejection history.
4. Reverse traversal is either exact and tested or explicitly labeled lossy.
5. “Charge” is initially a typed occupancy value, not a claim about electrical charge.
6. “Learning” is not claimed until a controlled downstream task beats both an unchanged baseline and a size-matched control across multiple seeds.

## Candidate formalization

For a canonical byte with bits `x_i in {0,1}`:

```text
identity(x) = sum x_i * 2^i
beta_H = normalize(dH_hw, calibration_receipt) > 1
radix_view(x; beta_H) = sum x_i * beta_H^i
```

`dH_hw` must declare units, range, hardware profile, and calibration identity. `beta_H` is the normalized, dimensionless value used by the positional view. `radix_view` is a view, not a replacement identity. If `beta_H` is non-integer, finite encodings may be non-unique; the bit receipt therefore remains authoritative.

A sweep state is:

```text
S = (byte_id, bit_origin, direction, phase, field_id, position, attempt)
```

At each micro-step, the field proposes a displacement. A candidate is accepted only when it does not violate the declared exclusion radius. Acceptance writes a receipt. Rejection rotates or perturbs phase according to a fixed rule. The process stops at a declared budget; it does not promise that every cell can be filled.

## Existing local evidence

The SCBE integer-phase-shards experiment already supplies two reusable primitives:

- exact rational carry scaling, including reversal;
- exact 30-degree phase steps whose twelfth application is the identity.

Focused verification on 2026-11-17: `26 passed` in `tests/crypto/test_integer_phase_shards.py`. This evidence covers those primitives only. It does not validate the new occupancy field or learning claim.

## Smallest useful experiment

Compare canonical binary against a typed `beta_H` view while holding bytes, candidate count, storage, and updates constant. Run forward and reverse sweeps through the same lattice under four placement arms: round-robin, hash, random hard exclusion, and field-guided hard exclusion. Measure exact identity round-trip, accepted occupancy, rejection rate, jamming/fill fraction, path length, compute cost, and downstream retrieval or routing utility.

Use at least three seeds; report `UNDERPOWERED` unless the candidate beats both the unchanged baseline and a size-matched control by at least twice the pooled standard deviation.
