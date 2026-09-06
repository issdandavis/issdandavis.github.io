# AetherMoore Studio and introduction video brief

Date: 2026-09-06
Status: design brief; no public route or deployment change in this pass

## Decision

Keep the existing browser workspace, editor, terminal, Clay hooks, and GeoSeal
tools. Put a thin task launcher in front of them. A visitor should not need to
understand the internal runtime or command vocabulary before beginning useful
work.

The published *The Miracle Was The Memory* series is the first video-workflow
practice source. It is a story about Jesus that Issac Daniel Davis made for his
great-grandfather. Editing must preserve that Christian message and family
dedication. Production polish must not rewrite its theology, characters, or
narrative voice.

## Studio route

Target flow:

```text
AetherMoore front door ── Open Studio ──┐
                                       ├─ Resume / Code / Video ── Workspace
Polly quick action ───── Open Studio ───┘
                                                        └─ Advanced tools
                                                           Terminal / GeoSeal / runtime
```

### Navigation

- Add one persistent `Open Studio` destination on the front door. It goes
  directly to `/studio/`.
- Make Polly's `Open Clay Studio` action navigate directly. Do not turn it into
  a prompt that requires another submit and another route choice.
- Keep Studio reachable in one click from the front door and one click from
  Polly. Secondary catalogs may take two clicks at most.
- Use `Clay Studio` as the public name with the descriptor `Browser coding and
  media workspace`. Keep implementation/version labels in About or diagnostics.

### First screen

Show three primary actions, in this order:

1. **Start a coding task** — describe the outcome, select or create a project,
   and enter the editor.
2. **Review or edit a project** — open a recent project, repository, or file.
3. **Work with a video or transcript** — add a YouTube URL, local media file, or
   transcript and open the media workbench.

Below them, show `Resume recent work` when history exists. The page should have
no more than three equal-weight primary buttons.

### Terminal and tool controls

The current terminal starts with a long command inventory and the runtime panel
starts with four system-oriented buttons. Replace that first impression with:

- one searchable command palette;
- up to four contextual suggestions based on the active task;
- a collapsed `Advanced tools` drawer containing Terminal, GeoSeal, tool bus,
  AI channels, and runtime diagnostics;
- plain availability messages such as `Browser workspace ready` and `Local
  Clay is available only in the owner session`;
- task verbs on buttons (`Open project`, `Review changes`, `Build captions`),
  with icons as supporting marks rather than the entire label.

The terminal remains fully capable after the user opens it. Its help output can
group commands as Files, Code, AI, Security, Media, and Operations instead of
printing one undifferentiated line.

### Studio acceptance checks

| Check | Target |
| --- | --- |
| Front door to working Studio | one click, then one task choice |
| Polly to Studio | one click |
| Time to first useful action | 10 seconds or less in a clean session |
| Primary actions on landing screen | three |
| Advanced command inventory | hidden until requested |
| Public/owner capability boundary | stated in plain language before an unavailable action |
| Keyboard path | every primary action reachable without a pointer |
| Mobile layout | one readable column; no terminal required to start |

## Long-form AetherMoore introduction

Create a four-to-six-minute introduction. It should feel like an engineering
story with a human reason for existing, not a product montage or synthetic hype
reel.

### Story outline

| Time | Purpose | Picture direction |
| --- | --- | --- |
| 0:00–0:15 | Cold open: “I wanted AI systems that can show their work.” | One clean statement, survey line drawing, restrained title |
| 0:15–0:45 | Introduce Issac and AetherMoore plainly | Founder voice or on-camera introduction; real workspace details |
| 0:45–1:30 | Explain the problem | Model proposes; external software authorizes; receipts preserve evidence |
| 1:30–2:30 | Demonstrate the route | Polly to Studio to governed execution to evidence, captured from the real product |
| 2:30–3:30 | Show the research boundary | Clay, GeoSeal, topology, and patent concepts; label measured, experimental, and proposed claims |
| 3:30–4:30 | Explain the human motive | Books, family, and the Miracle project as evidence that the work is meant to serve people |
| 4:30–5:00 | Give one next action | Ask Polly or open Studio |

Do not force *The Miracle Was The Memory* into a company advertisement. Its
personal origin can explain Issac's motive, while the book keeps its own title,
tone, and destination.

### Visual and audio language

- Match the site's white mineral-survey and engineering-paper design.
- Use original diagrams, real screen recordings, carefully chosen book art, and
  restrained motion. Avoid stock cyberpunk footage, fake dashboards, generic
  robot imagery, and an AI avatar speaking for Issac.
- Prefer Issac's voice when practical. If another narrator is used, approve a
  complete voice test before rendering the full program.
- Final narration target: approximately -16 LUFS integrated and no higher than
  -1.5 dB true peak. Treat those as delivery targets, not a reason to normalize
  blindly.
- Review every caption against the final narration and preserve names,
  scripture references, and theological wording exactly.
- Use a click-to-load YouTube player with a poster image. Do not autoplay on the
  home page.

### Production gates

1. Approve the spoken script after a timed read.
2. Approve the claim ledger: demonstrated, measured, experimental, and proposed.
3. Approve the shot list and low-resolution animatic.
4. Produce one 30-second style proof.
5. Review voice, music, visual continuity, generated-image artifacts, captions,
   and mobile readability.
6. Render the full video only after the style proof passes.
7. Upload privately or unlisted, perform a final playback check, then publish
   and embed.

## Miracle Chapter 1 practice

The public playlist currently contains 59 entries: 46 audiobook uploads and 13
illustrated uploads. The matched Chapter 1 pair is:

- Illustrated: `qbusE76OM7o`, 6:23.
- Audiobook: `ly0j3-2YH-s`, 6:35.

This pair can test picture pacing, caption repair, narration alignment, and
thumbnail quality while keeping the text fixed.

Recovered locally:

- YouTube metadata, thumbnail, and two English automatic-caption tracks for the
  illustrated version.
- A local `miracle-ch01.mp3`, 6:27.475, mono 24 kHz, SHA-256
  `a70e6e02d0ab7258695e3dfe8d8978527c3f06c7909daabbef8924267eeb99cd`.
- Measured audio: -20.51 LUFS integrated, -1.87 dB true peak, 2.70 LU loudness
  range. The duration differs from both published versions, so it needs a sync
  test before it is substituted into either video.

The automatic captions contain rolling duplicates, inconsistent character
spellings (`Dag`, `Dagan`, and `Dagon`), and a truncated final sentence. They are
useful as a timing aid and must not be published without a manuscript or audio
proofread.

The thumbnail has strong warm firelight and readable character staging. It also
contains suspicious generated lettering on a foreground container, so the full
illustrated sequence needs a frame-by-frame artifact pass.

### First style proof

Build a 30-to-45-second proof from the Chapter 1 opening after recovering the
video source:

- retain the opening road metaphor and original narration;
- use three to five deliberate shots rather than rapid image changes;
- animate depth subtly with controlled pans or parallax;
- establish one caption style with high contrast and safe mobile margins;
- end on the chapter title and dedication, without adding a promotional call to
  action inside the story.

Judge the proof on narration clarity, image continuity, reverence for the text,
caption accuracy, visible image-generation errors, and whether movement adds
meaning. Do not judge it by the number of effects.

## Source recovery

The original Miracle edit/project masters were not found in the obvious local
media folders, OneDrive `Videos`/`Books`, or Google Drive `Videos` locations.
The machine-readable catalog is
[`MIRACLE_VIDEO_INVENTORY_20260906.json`](MIRACLE_VIDEO_INVENTORY_20260906.json).

The cookie-free media download was blocked by current YouTube playback
attestation, while metadata, captions, and thumbnail downloads succeeded. Use
the owner's supported recovery paths before editing:

1. For one working copy, use YouTube Studio → Content → video menu → Download.
   YouTube documents this as a 720p or 360p MP4 download for the uploader.
2. For the archive, request the YouTube data through Google Takeout. Google says
   uploaded videos may be delivered in their original format or H.264/AAC MP4.
3. Store recovered masters outside the website repository, hash them, and map
   each file to its video ID before making derivatives.

References:

- [Download videos you uploaded — YouTube Help](https://support.google.com/youtube/answer/56100?hl=en)
- [Download your Google data — Google Account Help](https://support.google.com/accounts/answer/3024190?hl=en)
- [YouTube Proof-of-Origin token guide — yt-dlp](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide)

## Implementation order

1. Add the task-first Studio launcher and direct one-click routes.
2. Connect `Work with a video or transcript` to the existing media workbench.
3. Recover and hash Chapter 1 through YouTube Studio or Takeout.
4. Produce and review the Miracle style proof.
5. Apply the proven workflow to the new AetherMoore introduction.
6. Embed only the approved final introduction.
