Here’s a **tight, Codex-ready summary** you can drop straight in. I’ve kept it implementation-focused and aligned with what you’ve been building.

---

# Enemy Roles, HP, and Beat-Firing — Implementation Summary

## 1. Core Problem

Increasing HP reduced readability because enemies are not just targets — they are **role carriers in a compositional system**.

Readability comes from:

> **simultaneous role contrast (foundation / support / lead / ornament)**

—not from enemies staying alive longer.

---

## 2. Key Principle

> **Separate combat systems from musical/role systems.**

An enemy should not need to stay alive or active in music to remain valid in combat.

---

## 3. Split Enemy State

```js
musicRole: "support"        // role identity
musicState: "active"        // active / muted / released
combatState: "armed"        // armed / suppressed / disabled
```

### Rule

* Losing a music role **must NOT disable combat**
* Enemy falls back to **default combat behaviour**

---

## 4. Replace HP as a Readability Tool

HP = difficulty only

Do NOT use HP to control:

* role visibility
* musical timing
* composition stability

Instead, introduce:

---

## 5. Role Lifecycle Contract

```js
roleLifecycle: {
  role: "support",
  minReadableBars: 2,
  maxRoleBars: 4,
  replacementPolicy: "refresh_before_exit",
  canBlockOtherRoles: false,
  deathPolicy: "transfer_or_replace"
}
```

### Rules

* Roles track **time in bars**, not enemy lifetime
* If a role dies early → **replace or transfer**
* If an enemy lives too long → **stop blocking role refresh**

---

## 6. Critical Separation

> **An enemy can be alive without carrying a role**
> **A role can persist without the original enemy**

---

## 7. Role Exit Behaviour

When a role ends:

```js
musicState = "released"
combatState = "armed"
```

Enemy switches to fallback:

```js
fallbackFirePattern: {
  grid: "quarter",
  allowedSteps: [0, 4],
  maxShotsPerBar: 1
}
```

---

## 8. Beat-Aligned Firing System

### Principle

> **Enemies request shots — conductor schedules them**

No per-enemy independent timers.

---

## 9. Fire Flow

```js
enemy.intent = "fire"

conductor.requestFireSlot({
  enemyId,
  role,
  urgency,
  pattern
})

→ returns fireAtStep
→ weapon fires on that step
```

---

## 10. Role-Based Rhythm Patterns

```js
foundation: [0]        // strong beats
support:    [2, 6]     // offbeats
lead:       [0, 3, 5]  // phrases
ornament:   [7]        // fills
```

### Rule

* Not all enemies fire on the same beat
* Roles occupy **different rhythmic lanes**

---

## 11. Firing vs Music State

```js
if (musicState === "active") {
  use role pattern
} else {
  use fallback pattern
}
```

---

## 12. Conductor Responsibilities

The conductor must:

* ensure **role coverage over time**
* ensure **no role is blocked by long-lived enemies**
* distribute firing to avoid **clumping**
* maintain **rhythmic clarity**

---

## 13. Difficulty Scaling

Do NOT scale readability via HP.

Instead scale:

* shots per bar
* syncopation
* telegraph length
* role overlap

---

## 14. High-Level Rule

> Gameplay embodies music, but does not control or break it.
> Combat systems must not interfere with role readability or musical structure.

---

## 15. Design Intent (important)

Enemies exist to create **clear, readable challenges**, not just durability targets — each enemy should reinforce a specific role or player interaction ([book.leveldesignbook.com][1]).

---

If you want, next step is I can turn this into:

* a **PhaseRuntime / Conductor contract** (fits your doc style)
* or **exact Codex tasks / diffs** to implement this cleanly without breaking current systems

[1]: https://book.leveldesignbook.com/process/combat/enemy?utm_source=chatgpt.com "Enemy design"
