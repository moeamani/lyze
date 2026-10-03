---
name: humanize
description: Detect and eliminate AI-writing tells so copy reads as genuinely human. Use this skill EVERY time you write or rewrite outreach messages, client emails, proposals, social captions, CV copy, website copy, reviews, researches, articles and thesis for Moe/Ali. Also trigger when the user says "humanize", "sounds like AI", "make it human", "not AI created", "robotic", or asks to review text for AI patterns. Apply it proactively to your own drafts before presenting them, not only when asked.
---

# Humanize Copy

A skill for writing (and rewriting) text that carries no fingerprints of AI generation and has an actual pulse. Built on the Humanizer pattern catalog (33 documented patterns derived from Wikipedia's "Signs of AI writing" field guide, with before/after examples), the Grammarly common-AI-words research.

The master principle: **generic is the tell; specific is the fix.** Every sentence that could appear in anyone's copy is a liability; every sentence only you could write is proof of life. And removing tells is only half the job: sterile, voiceless writing is just as obvious as slop.

## Process (draft, audit, final)

1. **Read the input** and identify every pattern instance. The complete catalog with before/after examples is in `references/patterns.md`; scan the quick list below first, open the reference for anything you need the exact fix for.
2. **Write a draft rewrite.** Rewrite, don't delete: cover everything the original covers (five paragraphs in, five paragraphs out). Preserve meaning. Prefer specific details and simple constructions (is/are/has). Vary sentence length.
3. **Audit the draft.** Ask literally: "What makes the below so obviously AI generated?" List the remaining tells honestly.
4. **Write the final rewrite** that fixes them. Hard gate before delivering: scan for em dashes and en dashes; any hit means it is not done.
5. **Verify substance.** Never ship claims, metrics, or references that haven't been checked. Polished wording over unverified facts is the deeper failure mode.

For short messages (DMs, quick replies), steps 2-4 can collapse into one pass, but the audit question and the dash scan always happen.

## Voice calibration

If a writing sample from the author exists, match it: sentence length habits, word register, how paragraphs open, punctuation tics, recurring phrases. Don't just remove AI patterns; replace them with the author's patterns. If they write "stuff," don't upgrade it to "elements." No sample: default to a natural, varied, lightly opinionated voice.

## Personality and soul

Apply to blog posts, captions, essays, outreach, anything with an author. (For technical, legal, or reference text, neutral and plain IS the correct human voice.)

- Have reactions, not just reports. Mixed feelings are human; clean takes are synthetic.
- Vary rhythm. Short sentence. Then a longer one that takes its time getting where it's going.
- Let some mess in: an aside, a self-correction, a tangent that earns its place.
- One concrete, lived detail per piece where honest (a real project name, a real constraint, a real observation) beats three polished generalities.

## Quick scan (the 33 patterns, grouped)

**Content:** 1 inflated significance/legacy claims · 2 notability padding · 3 superficial trailing -ing analyses · 4 promotional/brochure tone · 5 weasel attributions · 6 formulaic "Challenges / Future Outlook" sections

**Language and grammar:** 7 AI vocabulary (delve, tapestry, pivotal, landscape, testament, vibrant, intricate, fostering, underscore, showcase...) · 8 copula avoidance (serves as / boasts instead of is / has) · 9 negative parallelisms and tailing negations ("It's not X, it's Y", "...no guessing") · 10 rule-of-three overuse · 11 elegant variation (synonym cycling) · 12 false ranges · 13 passive voice and subjectless fragments

**Style:** 14 em and en dashes (hard ban, replace with period, comma, colon, or parentheses) · 15 boldface overuse · 16 bold-header bullet lists · 17 Title Case Headings · 18 emojis in structure · 19 curly quotes

**Communication artifacts:** 20 chatbot correspondence leftovers ("I hope this helps!", "Want me to...?") · 21 knowledge-cutoff disclaimers and speculative gap-filling ("maintains a low profile") · 22 sycophantic tone

**Filler and hedging:** 23 filler phrases ("in order to", "due to the fact that") · 24 stacked hedging ("could potentially possibly") · 25 generic upbeat conclusions · 26 uniform hyphenated-pair overuse · 27 persuasive authority tropes ("the real question is", "at its core") · 28 signposting ("let's dive in") · 29 fragmented headers with restating one-liners · 30 diff-anchored writing · 31 manufactured punchlines and staccato drama · 32 aphorism formulas ("X is the Y of Z")

Every pattern has a before/after example in `references/patterns.md`. The Grammarly word tables with swaps live in `references/ai-tells.md`.

## Detection guidance (avoid false positives)

Look for **clusters, not isolated tells**. One em dash means nothing; em dashes plus rule-of-three plus "vibrant tapestry" plus a Conclusion section is a confession. Do NOT flag on their own: polished grammar, formal vocabulary in general, single transition words, curly quotes alone (editors auto-curl), one short emphatic sentence, letter-style openings, or unsourced claims. Never rewrite watched phrases inside quotations, titles, or examples where the phrase is being discussed rather than used.

**Preserve signs of human writing:** specific hard-to-fabricate details, mixed feelings and unresolved tension, era-bound references, genuine asides and self-corrections, varied sentence lengths. Over-editing these destroys exactly what makes the piece sound human. Don't over-sanitize: stripping every conceivable tell produces stiff generic text that reads MORE artificial.

AI detectors are unreliable in both directions; never treat a score as proof and never write to beat a detector. Write for humans.

## House rules (always apply)

- **No em dashes or en dashes. Ever.** Use commas, colons, periods, or parentheses.
- **Human, warm, non-AI-sounding voice** in all client-facing and candidate-facing writing.
- **No invented content or metrics.** Truthful reframing only. Verify every claim and reference before it ships.
- **Concise over comprehensive.** Cut preamble and postamble.

## Output format

For rewrite requests, deliver: the final rewrite, plus (when useful or asked) the brief "what was still AI" audit bullets and a one-line summary of changes. For Dmazing outreach drafted fresh, apply everything silently and deliver clean copy.

## References

- `references/patterns.md`: the complete Humanizer catalog, 33 patterns with before/after examples, voice calibration detail, personality guidance, full detection and false-positive lists, and a worked full-length example (the Lisbon rewrite).
- `references/ai-tells.md`: Grammarly word tables with meanings and swaps, humanizing strategies, responsible-use checklist.
