# Steph Ango's Obsidian Vault Philosophy

> "The files you create are more important than the tools you use to create them." — Steph Ango

**See also:** [Karpathy Method](./Karpathy.md) · [Swarm Intelligence](./Swarm.md) · [Mixture of Experts](./MoE.md) · [README](../README.md) · [FAQ](../FAQ.md) · [BENCHMARK](../BENCHMARK.md)

## Table of Contents

1. [Who is Steph Ango](#who-is-steph-ango)
2. [The Vault Philosophy](#the-vault-philosophy)
3. [Core Principles](#core-principles)
4. [Vault Structure](#vault-structure)
5. [Linking and Organization](#linking-and-organization)
6. [Properties and Templates](#properties-and-templates)
7. [Fractal Journaling](#fractal-journaling)
8. [The Rating System](#the-rating-system)
9. [Personal Rules and Style](#personal-rules-and-style)
10. [Related Writing](#related-writing)
11. [Relevance to Chac](#relevance-to-chac)
12. [References](#references)

---

## Who is Steph Ango

Steph Ango is the CEO of [Obsidian](https://obsidian.md), the private, flexible writing app that adapts to the way you think. He is also the creator of the [Minimal](https://minimal.guide/) theme and the [Flexoki](https://stephango.com/flexoki) color scheme. His writing covers software philosophy, personal productivity, and knowledge management.

---

## The Vault Philosophy

Ango's approach to note-taking is **bottom-up** — he embraces chaos and laziness to create emergent structure. The system is oriented towards speed and minimal overhead, avoiding rigid organizational schemes in favor of linking and properties.

### The Three Pillars

1. **File over app** — Digital artifacts must be files you control, in formats that are easy to retrieve and read. Apps are ephemeral; your files have a chance to last ([source](https://stephango.com/file-over-app)).

2. **Evergreen notes** — Ideas are turned into objects you can manipulate, combine, and stack. Evergreen notes have titles that distill each idea into a succinct, memorable phrase ([source](https://stephango.com/evergreen-notes)).

3. **Don't delegate understanding** — Manual maintenance of your knowledge base (random revisits, link repair, formatting cleanup) helps you understand your own patterns. Automating this with LLMs defeats the purpose ([source](https://stephango.com/understand)).

---

## Core Principles

### Concise Explanations Accelerate Progress

Concise explanations spread faster, accelerate decision-making, and make ideas composable. "One idea can more easily be combined with another idea to form a third idea." ([source](https://stephango.com/concise))

### Style is Consistent Constraint

> "Having a style collapses hundreds of future decisions into one, and gives you focus."

Style is a set of constraints you stick to. It gives leverage (every reuse saves time), helps you know when you're breaking constraints, and eventually becomes a recognizable point of view. ([source](https://stephango.com/style))

### The 40 Questions Ritual

An annual end-of-year ritual of answering 40 reflective questions. Trends emerge over years of answering the same questions. The questions are available in [35 languages](https://github.com/kepano/40-questions). ([source](https://stephango.com/40-questions))

---

## Vault Structure

Ango uses very few folders. Most notes live in the **root** of the vault. He does not use nested sub-folders and navigates primarily via the quick switcher, backlinks, or links within notes.

### Folder Layout

| Folder | Purpose | Notes |
|---|---|---|
| **Root** | Personal writing — journal entries, essays, evergreen notes | Most notes live here. If it's in the root, it's something Ango wrote or relates directly to him. |
| **References** | Things outside his world — books, movies, places, people | Always named by title (e.g. `Book title.md`). Properties capture data like rating, author, genres. |
| **Clippings** | Things other people wrote — essays and articles | Saved from the web via Obsidian Web Clipper. |
| **Attachments** | Images, audio, videos, PDFs | Admin folder — hidden from file navigation. |
| **Daily** | Daily notes, named `YYYY-MM-DD.md` | Never written in directly. Exist solely to be linked to from other entries. |
| **Templates** | Note templates | Admin folder. |
| **Categories** | Top-level overviews per category (Books, Movies, etc.) | Present in the downloadable vault for clarity. |
| **Notes** | Example notes | Present in the downloadable vault for clarity. |

---

## Linking and Organization

Internal links are used **profusely**. The first mention of something is always linked. Links are often **unresolved** (the target note doesn't exist yet) — these serve as breadcrumbs for future connections.

### Example Journal Entry

```
I went to see the movie [[Perfect Days]] with [[Aisha]] at [[Vidiots]]
and had Filipino food at [[Little Ongpin]]. I loved this quote from
Perfect Days: [[Next time is next time, now is now]]. It reminds me of
the essay ...
```

- Movie, theater, restaurant → links to **References** folder entries
- Quote → becomes an **evergreen note** in the root
- Essay → lives in **Clippings** folder (not written by Ango)

### Organization Method

Notes are primarily organized using the `categories` property, displayed via [Obsidian Bases](https://help.obsidian.md/bases). Categories provide an overview of related notes without folder hierarchy.

---

## Properties and Templates

Almost every note starts from a [template](https://github.com/kepano/kepano-obsidian/tree/main/Templates). Templates allow lazy addition of metadata that aids future discovery.

### Property Categories

- **Dates** — created, start, end, published
- **People** — author, director, artist, cast, host, guests
- **Themes** — genre, type, topic, related notes
- **Locations** — neighborhood, city, coordinates
- **Ratings** — 1–7 integer scale

### Property Rules

1. **Reusable across categories** — `genre` is shared across books, movies, shows, enabling cross-category archives
2. **Composable templates** — *Person* and *Author* can be added to the same note
3. **Short names** — `start` instead of `start-date`
4. **Default to `list` type** — if a property might contain more than one value in the future

Property types are defined in [`.obsidian/types.json`](https://github.com/kepano/kepano-obsidian/blob/main/.obsidian/types.json).

---

## Fractal Journaling

A three-layer review system that creates a fractal web of one's life at varying degrees of detail.

### The Process

1. **Throughout the day**: Write individual thoughts using Obsidian's *unique note* hotkey (prefix `YYYY-MM-DD HHmm` + optional title)
2. **Every few days**: Review journal fragments, compile salient thoughts
3. **Monthly**: Review the daily/fragment reviews
4. **Yearly**: Review monthly reviews using the [40 Questions template](https://stephango.com/40-questions)

### Random Revisit

Every few months, use the *random note* hotkey to travel randomly through the vault. Use the local graph at shallow depth to see related notes. This helps:

- Revisit old ideas
- Create missing links
- Find inspiration in past thoughts
- Do maintenance (fix formatting, apply new style rules)

> "People have asked me if this could be automated with language models but I do not care to do so. I enjoy this process. Doing this maintenance helps me understand my own patterns."

---

## The Rating System

Anything with a `rating` property uses an integer from 1 to 7:

| Rating | Label | Description |
|---|---|---|
| 7 | **Perfect** | Must try, life-changing, go out of your way to seek this out |
| 6 | **Excellent** | Worth repeating |
| 5 | **Good** | Don't go out of your way, but enjoyable |
| 4 | **Passable** | Works in a pinch |
| 3 | **Bad** | Don't do this if you can |
| 2 | **Atrocious** | Actively avoid, repulsive |
| 1 | **Evil** | Life-changing in a bad way |

**Why 7?** More granularity at the top (for good experiences) without the excessive granularity of a 10-point scale.

---

## Personal Rules and Style

Ango's personal vault rules, chosen for consistency and reduced decision fatigue:

1. **Avoid splitting content into multiple vaults**
2. **Avoid folders for organization** — use properties and links instead
3. **Avoid non-standard Markdown** — plain text files for durability
4. **Always pluralize categories and tags** — `#people` not `#person`
5. **Use internal links profusely** — link first mentions, accept unresolved links
6. **Use `YYYY-MM-DD` dates everywhere** — sortable, unambiguous
7. **Use the 7-point rating scale** — consistent across all categories
8. **Keep a single to-do list per week** — written from scratch each week; items not remembered are dropped

### To-Do System

> "Every week I create a weekly note, and write my to-dos for the week. If any items didn't get done I roll them over to the next weekly note or drop them. I usually write my to-dos from scratch without looking at the previous week's list. This helps me decide which items I should drop. If I can't remember a to-do it probably wasn't that important."

([source](https://stephango.com/todos))

---

## Related Writing

- [File over app](https://stephango.com/file-over-app) — Files over apps, plain text over proprietary formats
- [Evergreen notes](https://stephango.com/evergreen-notes) — Ideas as composable objects
- [Concise explanations accelerate progress](https://stephango.com/concise) — Brevity as a force multiplier
- [Don't delegate understanding](https://stephango.com/understand) — Manual maintenance preserves self-knowledge
- [Style is consistent constraint](https://stephango.com/style) — Constraints as creative leverage
- [40 questions to ask yourself every year](https://stephango.com/40-questions) — Annual reflection ritual
- [How I do my to-dos](https://stephango.com/todos) — Weekly to-do system

---

## Relevance to Chac

Steph Ango's vault philosophy shares several principles with Chac's design:

### File-First Architecture

Chac runs entirely from a USB drive with local SQLite storage — no cloud dependencies. This aligns with Ango's "file over app" philosophy: data you control, in formats you can retrieve, independent of any single application.

### Knowledge Compilation

Ango's approach of synthesizing notes into interconnected wiki entries parallels Chac's wiki compilation step in the Karpathy Method. Both transform raw, fragmented inputs into structured, queryable knowledge.

### Bottom-Up Organization

Ango avoids top-down folder hierarchies in favor of properties, links, and emergent structure. Chac similarly avoids rigid document taxonomies — documents are ingested, chunked, embedded, and linked via vector similarity rather than predefined categories.

### Fractal Review as Knowledge Maintenance

Ango's fractal journaling (daily → weekly → monthly → yearly review) is a human-side analog of Chac's scheduled tasks. Chac's `memory-consolidation` task periodically reviews and consolidates cross-session memory, while `index-check` ensures vector indexes stay healthy — both serve the same purpose of maintaining knowledge quality over time.

### The 7-Point Scale

Ango's rating system offers a concrete, opinionated alternative to typical 5-star or 10-point scales. The asymmetry (more granularity at the top) reflects a bias toward remembering and surfacing the best experiences — useful context for any personal knowledge system.

---

## References

1. Ango, S. "How I use Obsidian." stephango.com/vault
2. Ango, S. "File over app." stephango.com/file-over-app, July 1, 2023
3. Ango, S. "Evergreen notes turn ideas into objects that you can manipulate." stephango.com/evergreen-notes, September 17, 2022
4. Ango, S. "Concise explanations accelerate progress." stephango.com/concise, August 20, 2023
5. Ango, S. "Don't delegate understanding." stephango.com/understand, August 13, 2023
6. Ango, S. "Style is consistent constraint." stephango.com/style, September 3, 2023
7. Ango, S. "40 questions to ask yourself every year." stephango.com/40-questions, October 20, 2016
8. Ango, S. "How I do my to-dos." stephango.com/todos, May 20, 2023
9. Matuschak, A. "Evergreen notes." notes.andymatuschak.org
10. Kepano, S. "Kepano Obsidian vault." github.com/kepano/kepano-obsidian
