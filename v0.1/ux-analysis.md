# UX Analysis — Dead Drop UI

## Don Norman's Design Principles Applied

---

## 1. Conceptual Model

Norman's central argument is that a design must communicate the right mental model. The user constructs a model of how something works by interacting with it, and mismatches between the user's model and the actual model produce errors and frustration.

**What model does this UI project?**

The current flow suggests: *"I have credentials → I unlock → I can read or write."* That's actually a reasonable model. But there's a hidden seam: **Unlock and Retrieve are two separate things**, and the user has no obvious reason to expect that. After clicking Unlock, the UI doesn't visually transform — the buttons just become enabled. A user's natural instinct might be to click Retrieve immediately after seeing "Unlocked," which is fine, but it's also likely they'll type in the box and then Retrieve, inadvertently clearing what they typed.

The deeper model problem: the textarea is **both input and output**, and the UI doesn't make that dual nature explicit. Norman calls this a **mode error** — the same control means different things in different states, and the user can't tell which mode they're in.

---

## 2. Affordances and Signifiers

Norman's distinction: an affordance is a real or perceived possibility for action; a signifier is a signal that communicates where or how to act.

**The dual-button action row:**

Currently Retrieve is outline (secondary) and Store is filled/dark (primary). But in a dead drop, the most natural first action is checking what's been left — i.e., Retrieve. Storing is what you do *after* you've decided to leave something. The visual hierarchy contradicts the natural flow.

This maps directly to the core tension: **Store is visually primary, but Retrieve is operationally primary for a drop-pickup scenario.** Flipping this would align signifiers with the actual user journey.

**The Unlock button:**

The Unlock button's label and behavior are slightly misleading. "Unlock" suggests opening a lock — but what it actually does is derive cryptographic keys from the passphrase. Nothing is "locked" or "unlocked" on the chain. A more honest label might be "Derive keys →" or just fold the unlock into the retrieve/store action silently. The unlock step is an implementation detail, not a user-facing concept.

---

## 3. Gulf of Execution

The gulf of execution is the gap between the user's intention and the available actions. Norman says good design makes it obvious what to do next.

**After unlocking, what does the user do?**

The UI has three possible states after unlock:

- No data at this slot → status says so, textarea is empty
- Data exists at this slot → status says so, but it hasn't been retrieved yet
- User wants to store something new

In the "data exists" case, the obvious next step is Retrieve, but the user must read the status line to know this. The form itself doesn't change — nothing pulls the eye toward the Retrieve button. Norman would say the state change isn't **visible enough** — it only manifests in a small 0.72rem status line.

A stronger design would automatically trigger the retrieve attempt after unlock, collapsing two steps into one. The user's goal is almost always "get my message" — the unlock is a prerequisite, not a goal in itself.

---

## 4. Gulf of Evaluation

The gulf of evaluation is the difficulty of assessing whether your goal was achieved after acting.

**After storing:** the status shows a transaction hash (`0x3a8f…`). For a non-crypto user this is noise — the meaningful feedback is "your message is now stored." The hash is useful for power users but should be secondary, not the lead.

**After retrieving:** content appears in the textarea. This is the clearest moment in the whole flow — the payoff is tangible. But the dirty mark system (`UNSAVED`, `MODIFIED`) immediately activates on the editor's state, which can confuse: the user just retrieved something, not composed something.

---

## 5. Mapping

Norman's principle of mapping: the spatial and conceptual relationship between controls and their effects should be natural.

**The wallet connect link appears below the action row, visible to all users.** But connecting a wallet is only required for Store — retrieve is deliberately gas-free. A user who only wants to retrieve is confronted with "Connect wallet →" as though it's a required step. The control is mapped globally when it should be mapped locally to the Store action only.

A better mapping: the wallet prompt should only appear when Store is attempted, not upfront.

---

## 6. Constraints and Forcing Functions

Norman loves these — design should make it hard or impossible to do the wrong thing.

**The current constraints are good**: Store is disabled until (unlocked + wallet connected + identifier + message content). Retrieve is disabled until (unlocked + identifier). These are correct forcing functions.

**But there's a missing constraint**: if the user has typed a message and then clicks Retrieve, the textarea is cleared at the start of retrieval (`setOutput("")`). There's no confirmation. This is a destructive action with no warning — a classic Norman error-prevention failure. The user's composed message is silently lost.

---

## 7. The Retrieve/Store Priority

Norman writes about **primary and secondary actions** and how the visual language of a UI should reflect the actual hierarchy of tasks.

For a dead drop specifically, the flow is asymmetric:

- **The depositor** (who stores) acts *once* in advance
- **The recipient** (who retrieves) acts *repeatedly* to check for messages

This is structurally closer to **email** (inbox/read is primary, compose is secondary) than to a notepad (write and read are equally common). The instinct to subordinate Store is well-founded by Norman's logic.

A concrete implication: what if Retrieve ran *automatically* after Unlock, with Store requiring an explicit extra step — like clicking "Compose" or "New message"? This would make the retrieval flow one action (Unlock, which triggers retrieve), and store a deliberate second mode. The model becomes: *"I check my drop, and if I want to leave something, I switch to compose."*

---

## 8. The Unified Input/Output Field

Norman would call the dual-purpose textarea a **polysemous control** — the same element has different meanings in different contexts. The line-numbered editor is particularly interesting: it signals "structured text, code, formal content," which is actually appropriate for agents storing JSON or credentials, but may feel wrong for human users leaving a plain note.

The editor's affordance shapes expectations. If the primary users are going to be agents depositing structured data, the editor style is honest. If primary users are humans, it's misleading.

---

## Summary

| Principle | Current Issue | Direction |
|---|---|---|
| Conceptual model | Textarea is both input and output; user doesn't know which mode they're in | Visually distinguish read state from write state |
| Signifiers | Store is visually primary; Retrieve is operationally primary | Flip button hierarchy |
| Gulf of execution | Unlock + Retrieve are two steps when the goal is one | Auto-retrieve on unlock, or merge the steps |
| Mapping | Wallet prompt always visible; only needed for Store | Show wallet UI only when Store is attempted |
| Constraints | No protection against losing a composed message on accidental Retrieve | Add a confirmation when retrieving over unsaved content |
| Feedback | Tx hash as lead success message | "Stored" as primary; hash as expandable detail |
| Mode | User doesn't know if they're in "reading" or "writing" state | A clear mode indicator — or separate the two flows entirely |

The deepest Norman critique of the current design: **the UI tries to be symmetric about two operations that aren't symmetric**. A dead drop is fundamentally about pickup — the deposit is the less frequent, more deliberate act. The interface doesn't reflect that asymmetry yet.