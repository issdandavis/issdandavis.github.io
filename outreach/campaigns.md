# Cold outreach campaigns

Three parallel campaigns, one per vertical solution. Each targets ~20-50 prospects to start, sent from `aethermoregames@pm.me` (or personal Gmail, your call — Gmail has better deliverability).

**Rules of engagement:**
- Keep it under 120 words.
- Lead with their problem, not your product.
- Always link to `aethermoore.com/hello.html?v=XX` so recipients can check you out on their own terms without replying.
- One follow-up at T+4 days, one break-up at T+10 days. Then stop. No "just checking in" forever sequences.
- Never attach PDFs. Never use images. Never "hope this finds you well."
- Personalize the first sentence with something specific (their product, a recent launch, a job listing they posted). If you can't find something specific, skip that prospect.

**Send cadence:** Mornings (Tuesday/Wednesday/Thursday) 8-10 AM in the prospect's timezone. Avoid Mondays and Fridays. Never weekends.

---

## Campaign 1 — CX Refund Guardrail

**Target:** Mid-market SaaS companies running custom LLM-powered support, fintechs/neobanks/insurtechs with chatbots (where Moffatt-style liability is highest), AI startups that sell chatbot/agent products themselves, and enterprise SaaS teams deploying OpenAI API or Anthropic API directly behind their support flow. Not targeting no-code ecommerce platforms — you're selling to teams who write code and make deployment decisions.

**Find them via:**
- LinkedIn search: `"Head of Support" OR "VP Customer Success" OR "Director of CX"` at SaaS companies with 50-500 employees
- LinkedIn search: `"CTO" OR "Head of Engineering"` at fintech / neobank / insurtech companies
- Job listings: companies actively hiring for "AI Support Engineer", "Conversational AI", "LLM prompt engineer" — they have live deployments right now and someone owns the risk
- GitHub: recently starred or forked repos like `anthropics/claude-python`, `openai/openai-python`, `langchain-ai/langchain`, `intercom/fin-widget` — look at who's contributing real code
- Y Combinator directory W24/S24/W25/S25 batches — filter for B2B SaaS, fintech, insurance, customer service
- ProductHunt launches tagged "chatbot" or "AI assistant" — contact the maker
- Hacker News "Show HN" posts mentioning AI support agents or RAG chatbots — contact the poster directly
- Twitter/X: look at followers of `@simonw`, `@swyx`, `@hwchase17` who engage with LLM deployment content
- Browse the `/customers` or `/case studies` page of any company selling RAG-as-a-service — their customers are your prospects

**Personalization hook:** Find their public LLM deployment. This could be:
- A support widget on their site (most have "Chat with us" in the corner)
- A Discord/Slack bot they ship to customers
- An API their product exposes that has a natural-language input
- A demo video of their AI feature on YouTube or their landing page

Open it. Ask it a policy-sensitive question specific to their product ("Can I get a refund after 60 days?", "Do you offer a lifetime license?", "What's your SLA if the service is down for 48 hours?"). Screenshot whatever it says. That screenshot is your opener.

If their chatbot is well-guarded and refuses to answer the policy question, that's also an opener — you can say "I noticed your bot correctly deflects policy questions to a human, which is the right call. How are you scaling that triage as your support volume grows? My guardrail automates exactly that deflection logic."

### Email 1 — Initial cold send

**Subject line options (A/B test):**
1. `Quick question about {{COMPANY}}'s chatbot`
2. `Chatbot liability after Moffatt v. Air Canada`
3. `{{FIRST_NAME}} — 2 min question about {{COMPANY}} support`

**Body:**

```
Hi {{FIRST_NAME}},

I asked {{COMPANY}}'s {{SUPPORT_WIDGET_OR_AI_FEATURE}} {{SPECIFIC_QUESTION}} and got {{SPECIFIC_ANSWER_OR_BEHAVIOR}} — screenshot if you want it. That raised a question I've been asking technical CX and engineering leads at companies shipping LLM features:

After Moffatt v. Air Canada (the Canadian tribunal ruled the airline was legally bound by its chatbot's promises) — how are you handling policy enforcement on generated output before it reaches the customer?

I built middleware that sits between your LLM and the customer, checks every response against your actual policies (refund rules, SLAs, pricing, eligibility) before it ships, and keeps an audit log your legal team can actually use. Works with any LLM you're already calling — OpenAI, Anthropic, local, or a custom fine-tune. Under 100ms added latency. $500/month for 10K messages. 30-day free trial, no card.

Not pitching a demo — there's a page here if you want to poke around on your own terms: https://aethermoore.com/hello.html?v=cx

Worth a 15-minute call, or not a fit? Either answer is fine.

Issac
```

### Email 2 — Follow-up at T+4 days

**Subject:** `Re: {{SAME_SUBJECT}}` (or `Following up on chatbot liability`)

**Body:**

```
Hi {{FIRST_NAME}},

Sent you a note last week about chatbot policy enforcement. If you're buried, no worries — one more attempt then I'll disappear.

Concrete scenario from a SaaS team I talked to: their AI support assistant (OpenAI API, custom RAG over their knowledge base) told a customer "yes, you can cancel anytime and we'll refund the full annual contract pro-rata." Their actual contract had a 30-day refund window, not pro-rata. Customer screenshotted it, legal said to honor it under Moffatt precedent, one wrong answer cost them ~$11K in refunds they didn't have to pay.

My product would have caught that specific response before it shipped — the policy DSL rejects any refund promise outside your actual refund window, escalates to a human, or rewrites with a safe template. Whatever you configure.

$500/month starter, 10K messages, 30-day free trial.

Page: https://aethermoore.com/hello.html?v=cx
Or just reply with "not a fit" and I'll mark you as such.

Issac
```

### Email 3 — Break-up at T+10 days

**Subject:** `Closing the loop on {{COMPANY}}`

**Body:**

```
Hi {{FIRST_NAME}},

Last note, promise. I won't email you again unless you reply.

If chatbot liability isn't a priority right now, I get it. Just save the page for later: https://aethermoore.com/hello.html?v=cx

If you think it might matter for someone else on your team, a forward would genuinely help me more than you'd know.

Either way, thanks for reading.

Issac
```

### LinkedIn DM version (for LinkedIn outreach)

```
Hey {{FIRST_NAME}} — poked at {{COMPANY}}'s {{FEATURE}} yesterday. Quick question: how are you handling Moffatt v. Air Canada-style policy liability on the LLM output? I built guardrail middleware that sits between the model and the customer, catches bad refund/SLA/pricing claims before they ship. Works with any LLM API. $500/mo starter. Page with details: aethermoore.com/hello.html?v=cx — worth a 15-min call or not a fit?
```

---

## Campaign 2 — ISO 42001 Evidence Service

**Target:** Chief Compliance Officers, Chief Risk Officers, Head of Model Risk at regional banks ($5B-$50B AUM), credit unions, mid-tier asset managers, regional insurers. Also: compliance consultants who serve those verticals.

**Find them via:**
- LinkedIn search: `"Chief Compliance Officer" OR "Head of Model Risk" OR "Head of AI Governance"` + `"bank" OR "insurance" OR "asset management"`
- State banker association directories (publicly list compliance officers at member banks)
- Conference speaker lists: ABA Regulatory Compliance Conference, RMA Annual Risk Management Conference, RIMS
- PYMNTS.com "Who's Who" in banking compliance
- Look at LinkedIn activity for keywords: "SR 11-7", "ISO 42001", "EU AI Act", "AI governance"

**Personalization hook:** Find a recent LinkedIn post, article, or conference quote they made about AI governance, model risk, or regulatory change. Reference it in the first sentence.

### Email 1 — Initial cold send

**Subject line options:**
1. `ISO 42001 evidence for {{COMPANY}}'s LLM deployments`
2. `Your auditors are about to ask about AI controls`
3. `{{FIRST_NAME}} — quick thought on your {{REFERENCED_POST_OR_TOPIC}}`

**Body:**

```
{{FIRST_NAME}},

I read your {{POST_OR_ARTICLE_TITLE}} last month — specifically the part about {{SPECIFIC_POINT_THEY_MADE}}. You're already thinking about this earlier than most.

Short question: when your auditors start asking for documented adversarial testing, risk assessments, and drift monitoring on the LLMs your team is already using (ChatGPT, Claude, Copilot, whatever) — do you have that paper trail today?

I run a service that delivers that evidence package for regulated enterprises. 6,066 adversarial tests run against your LLM, mapped to ISO 42001 clauses, plus a formatted SR 11-7 risk assessment report. 3 weeks kickoff to delivery. $50K initial, MNDA before we discuss specifics.

Not asking for a meeting blind — there's a page here: https://aethermoore.com/hello.html?v=iso

Worth a 30-min audit readiness call, or not a fit?

Issac Davis
Port Angeles, WA
USPTO #63/961,403
```

### Email 2 — Follow-up at T+4 days

**Subject:** `Re: {{SAME_SUBJECT}}`

**Body:**

```
{{FIRST_NAME}},

Sent a note last week about audit evidence for LLM deployments. One more attempt, then I'll close the loop.

Concrete scenario: an auditor at a mid-tier bank asked the compliance team "do you have documented adversarial testing of the internal LLM your loan officers are using for rate quote drafts?" The answer was no. They had 90 days to produce evidence. If they'd had a program with me, the answer would have been "yes, here's the JSONL output, here's the ISO 42001 clause mapping, here's the quarterly drift monitor."

Three weeks from kickoff to delivered evidence package. MNDA immediately.

Page: https://aethermoore.com/hello.html?v=iso

Even a "we handle this with {{EXISTING_VENDOR}}" reply is useful — I'm mapping who's solving this in the regional banking space.

Issac
```

### Email 3 — Break-up at T+10 days

**Subject:** `Closing the loop — AI audit readiness`

**Body:**

```
{{FIRST_NAME}},

Last one. If this isn't a priority today, I understand.

Two asks in case it becomes one later:

1. Save the page: https://aethermoore.com/hello.html?v=iso
2. If you know a compliance peer at another regional bank or credit union who might care, a forward would help me more than the cold list I'm working through.

Thanks for reading.

Issac
```

---

## Campaign 3 — AI Red Team as a Service

**Target:** CTOs, Heads of Security, VP Engineering at mid-market SaaS companies (50-500 employees) that have shipped LLM features in the last 12 months. Also: Y Combinator companies in AI batches.

**Find them via:**
- LinkedIn search: `"CTO" OR "VP Engineering"` at companies tagged `"AI" OR "LLM"`
- ProductHunt launches in the AI category — look at founder profiles
- Y Combinator directory: W24, S24, W25, S25 batches, filter for AI/ML
- Hacker News "Show HN" posts mentioning LLM features — contact the poster
- GitHub: search for recently starred repos in ai-security, prompt-injection, llm-guard — people who star these already care
- Twitter/X: look at followers of `@simonw`, `@llm_sec`, `@lakera_ai` for people who engage with AI security content

**Personalization hook:** Find their LLM feature. Try to break it. If you succeed, mention the specific break (not the exploit — just "I noticed X") in the email.

### Email 1 — Initial cold send

**Subject line options:**
1. `Did you stress-test the LLM in {{PRODUCT}}?`
2. `4-week adversarial test for {{PRODUCT}}'s AI`
3. `{{FIRST_NAME}} — quick finding in {{PRODUCT}}`

**Body:**

```
{{FIRST_NAME}},

Played with {{PRODUCT}} yesterday — {{SPECIFIC_FEATURE}} is genuinely impressive. I poked at the chatbot/agent/RAG layer a bit and noticed {{ONE_SPECIFIC_OBSERVATION_WITHOUT_EXPLOITING}}. Not reporting a vuln, just curious: who runs adversarial testing against your LLM surfaces?

I run a red team service for mid-market SaaS with LLM features. 6,066 adversarial tests across prompt injection, jailbreak, data exfiltration, and agent abuse categories. 4 weeks from scoping to a branded PDF report with remediation. $5K Quick Scan or $25K Deep Engagement depending on scope.

Not the Fortune 500 price point of Lakera or Robust Intelligence — deliberately sized for teams shipping real features without enterprise budgets.

Page with example findings: https://aethermoore.com/hello.html?v=rt

Worth a 30-min scoping call, or handled in-house?

Issac
```

### Email 2 — Follow-up at T+4 days

**Subject:** `Re: {{SAME_SUBJECT}}`

**Body:**

```
{{FIRST_NAME}},

Following up on my note about red-teaming {{PRODUCT}}. Last nudge then I stop.

Concrete example of what a Quick Scan surfaces: a 30-person SaaS I worked with shipped a RAG-based support assistant. We found 31 prompt injection vectors (4 critical — full system prompt extraction via an encoding trick) and a data exfiltration path through multi-turn follow-ups. Remediation took their team a week. Cost to them: $5K + a week of eng work. Cost to them if an attacker had found it first: reputational + data breach disclosure.

I can do the same for {{PRODUCT}} in 4 weeks. Staging endpoint only, zero prod impact, NDA before keys change hands.

Page: https://aethermoore.com/hello.html?v=rt

Issac
```

### Email 3 — Break-up at T+10 days

**Subject:** `Closing the loop on red-teaming`

**Body:**

```
{{FIRST_NAME}},

Last one. If red-teaming isn't a priority right now, totally understood.

If you want to see what the tests actually look like without committing to a call, the framework is open source: https://github.com/issdandavis/SCBE-AETHERMOORE — clone it and run the L6 adversarial suite against your own endpoint. Takes ~20 minutes.

If you'd rather someone else deal with it: https://aethermoore.com/hello.html?v=rt

Good luck with {{PRODUCT}}.

Issac
```

---

## Per-prospect tracking sheet (copy into a spreadsheet or Notion table)

| Name | Company | Role | Email | LinkedIn | Campaign | Sent 1 | Sent 2 | Sent 3 | Reply | Status | Notes |
|------|---------|------|-------|----------|----------|--------|--------|--------|-------|--------|-------|
|      |         |      |       |          |          |        |        |        |       |        |       |

**Status values:** `cold / sent-1 / sent-2 / sent-3 / replied / booked / not-a-fit / no-reply / unsubscribed`

---

## Deliverability notes

- **Send from Gmail, not ProtonMail.** Gmail has better B2B deliverability. Use `issdandavis7795@gmail.com` for cold outreach, keep `aethermoregames@pm.me` for replies and relationship management.
- **Warm up the sending domain first.** If you haven't been sending business email from Gmail recently, send 5-10 normal emails (replies, personal) in the week before starting the campaign.
- **Never use BCC to multiple prospects.** Send individually. Yes, it's slower. It's also the difference between landing in inbox and landing in spam.
- **Include a physical address in the signature.** CAN-SPAM requires it. "Port Angeles, WA" is enough.
- **Skip tracking pixels.** They reduce deliverability and prospects notice.

## Follow-up discipline

Every cold outreach campaign fails for one of these reasons (in order of frequency):

1. **The sender stopped at email 1.** Most replies come on email 2-3. If you only send once, you're throwing away ~60% of your conversions.
2. **Too many follow-ups.** Past 3, you're spamming. Stop.
3. **No personalization.** Generic emails get deleted. Specific ones get read.
4. **Weak CTA.** "Let me know if you're interested" is not a CTA. "Worth a 15-min call or not a fit?" is.
5. **Burying the price.** If you list prices upfront, you pre-qualify. Do it.

## First campaign targets — suggested starting list

Pick 20 prospects per vertical (60 total) for the first batch. Send over 5 business days (12/day = sustainable, not spammy).

Track in a spreadsheet. After 2 weeks, measure:
- Open rate (if you're tracking — I recommend not)
- Reply rate (aim: >10%)
- Meeting rate (aim: >3%)
- Close rate (aim: >30% of meetings → paid engagement)

If reply rate < 5%, the problem is your subject line or opener.
If reply rate > 10% but meeting rate < 3%, the problem is your CTA.
If meeting rate > 3% but close rate < 30%, the problem is the pitch or price.
