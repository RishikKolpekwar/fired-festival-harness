// Auto-extracted from the LIVE harness — GET /api/brief/latest at build time.
// This is Rishik's actual morning brief (rubric #5: runs on real input).
export const REAL_BRIEF = {
  "generatedAt": "2026-06-13T20:36:46.576Z",
  "topline": "two things move today, both on your direct path. anthropic splits agent sdk billing into its own capped credit pool june 15, so your harness draws from that pool now, not your plan. estimate your daily token spend and set the new hard token cap before june 16 or the assistant stalls mid run. on the pathology side, roche is closing a $1.05b pathai deal while leica, indica and lunit team up on biomarker scoring. that is your exact q3 er pr lane consolidating fast, so write yourself a positioning note before you build.",
  "items": [
    {
      "title": "anthropic splits agent sdk billing into its own credit pool june 15",
      "summary": "starting june 15, 2026 anthropic moves all programmatic claude usage off your subscription onto a separate finite monthly credit pool billed at standard api list prices. this hits the agent sdk, claude -p headless mode, and claude code inside github actions. interactive chat and the terminal stay untouched.",
      "whyItMatters": "this is the one that directly changes your harness economics. your personal assistant runs on the agent sdk, so it now draws from the capped credit pool, not your plan. budget for it before june 16 or your harness stalls quietly.",
      "score": 0.92,
      "sourceTag": "vc & accelerators",
      "flagged": false,
      "url": "https://startdebugging.net/2026/06/claude-agent-sdk-separate-credit-pool-june-15/"
    },
    {
      "title": "leica, indica and lunit team up on ai biomarker scoring at clinical scale",
      "summary": "leica biosystems, indica labs and lunit are joining forces to push ai biomarker scoring toward routine clinical use. the article frames the unlock as teaching software to read a slide and quantify the biomarkers that decide which patients get which drugs. it also notes roche's may agreement to buy pathai for up to 1.05 billion.",
      "whyItMatters": "this is exactly medmorphiq's lane, biomarker quantification that drives drug selection. the big incumbents are racing to own er pr style scoring, so your q3 ihc roadmap has to show something they can't, either deeper accuracy or a deployment moat.",
      "score": 0.9,
      "sourceTag": "ai infra & chip verification",
      "flagged": false,
      "url": "https://www.rdworldonline.com/leica-indica-labs-and-lunit-team-up-as-ai-biomarker-scoring-moves-toward-clinical-scale/"
    },
    {
      "title": "claude code lets sub agents spawn their own sub agents",
      "summary": "claude code v2.1.172 now lets sub agents spawn their own sub agents, up to 5 levels deep. it also fixed sessions on 1m context getting permanently stuck by auto compacting back under the standard limit. the agent sdk python package shipped v0.2.97 bundling the new cli.",
      "whyItMatters": "nested sub agents map directly onto your intel dv framework, where you want a planner spinning up specialized verification agents. you can restructure your harness around deeper delegation instead of a flat agent pool.",
      "score": 0.85,
      "sourceTag": "ai infra & chip verification",
      "flagged": false,
      "url": "https://github.com/anthropics/claude-code/releases/tag/v2.1.172"
    },
    {
      "title": "semiengineering writeup on building multi agent systems for asic flows",
      "summary": "semiengineering published a piece on using multiple agents to divide and conquer ic design problems. it features kexun zhang, head of research at chipagents, on why orchestrators are critical and how to parse a problem so agents have well defined roles. the core point is that multiple agents only beat one if roles and targets are clearly defined.",
      "whyItMatters": "this is your intel work written up by the trade press, with a competitor naming the orchestrator design choices you are making. read it to benchmark your dv framework's role decomposition against chipagents.",
      "score": 0.85,
      "sourceTag": "ai infra & chip verification",
      "flagged": false,
      "url": "https://semiengineering.com/building-multi-agent-systems-for-asic-flows/"
    },
    {
      "title": "claude agent sdk now ships a hard token cap, not just a dollar budget",
      "summary": "anthropic closed a feature request adding a token count cap to claudeagentoptions. before this you could only bound a run by max_budget_usd or max_turns. the dollar estimate drifted on cache heavy runs, so a true token ceiling is now available.",
      "whyItMatters": "you have been hitting token and pricing questions on the harness. this lets you cap each worker by actual tokens instead of a fuzzy usd estimate that undercounts on cached prompts. wire it into your multi agent loops.",
      "score": 0.85,
      "sourceTag": "vc & accelerators",
      "flagged": false,
      "url": "https://github.com/anthropics/claude-agent-sdk-python/issues/1024"
    },
    {
      "title": "roche's $1.05b pathai deal anchors a wave of clinical biomarker ai",
      "summary": "Leica, Indica Labs, and Lunit teamed up to push AI biomarker scoring toward clinical scale, building on the FDA cleared Aperio HALO AP DX workflow launched in March 2026. the piece notes Roche's May agreement to acquire PathAI for up to $1.05 billion, pending close. the unlock they cite is software reading a slide and quantifying the biomarkers that decide which drug a patient gets.",
      "whyItMatters": "this is the exact bar your ER/PR IHC quantification has to clear. the field is consolidating around quantitative biomarker scoring, so position MedMorphIQ as the cheaper, deployed alternative before Leica and Roche own the workflow.",
      "score": 0.85,
      "sourceTag": "tech",
      "flagged": false
    },
    {
      "title": "roche closing $1.05b deal for pathai",
      "summary": "roche signed a definitive merger to acquire pathai for up to $1.05 billion, building on a partnership that started in 2021. the focus is digital pathology and ai enabled companion diagnostic algorithms. the deal is pending closing.",
      "whyItMatters": "this is the comp that sets the ceiling for what a pathology ai company is worth. it tells you exactly who the strategic acquirers are when you raise or position medmorphiq.",
      "score": 0.84,
      "sourceTag": "pathology ai",
      "flagged": false,
      "url": "https://www.europesays.com/ch/80160/"
    },
    {
      "title": "leopold aschenbrenner's fund is 20% anthropic and up 270% this year",
      "summary": "situational awareness, the hedge fund run by 24 year old former ai researcher leopold aschenbrenner, has passed $20bn in assets less than two years after launch. it is up roughly 270% in the first five months of this year and over 1,000% net of fees since inception. anthropic is its single largest position at about 20% of the portfolio.",
      "whyItMatters": "you build on claude and follow anthropic closely. the smartest ai concentrated fund in the world is betting a fifth of $20bn on the company whose sdk you build with. that is a strong external read on the platform you are tied to.",
      "score": 0.82,
      "sourceTag": "markets & quant",
      "flagged": false,
      "url": "https://www.hedgeweek.com/situational-awareness-soars-past-20bn/"
    }
  ],
  "actions": [
    {
      "kind": "email",
      "who": "Aydogan Ozcan lab, UCLA (corresponding author on the her2 holography paper)",
      "org": null,
      "reason": "their uncertainty aware ihc scoring work overlaps directly with your ki-67 and er pr quantification. an intro conversation could surface methods worth borrowing and a possible academic validation partner."
    },
    {
      "kind": "follow_up",
      "who": null,
      "org": null,
      "reason": "the leica indica lunit team up and the roche pathai deal show incumbents consolidating around ai biomarker scoring, the exact lane of your q3 er pr roadmap. worth a focused positioning note to yourself before you build, so medmorphiq differentiates on something they cannot easily copy."
    },
    {
      "kind": "email",
      "who": "Kexun Zhang, head of research at ChipAgents",
      "org": null,
      "reason": "chipagents is building the multi agent asic orchestration you work on at intel. a short founder to founder note comparing notes on role decomposition could open a useful relationship."
    },
    {
      "kind": "email",
      "who": "DiaDeep (Lyon oncology pathology AI) founder or BD lead",
      "org": null,
      "reason": "DiaDeep just got global distribution through Leica's Aperio AI Store. they are a few steps ahead of MedMorphIQ on the exact distribution path you need, so a peer conversation on getting an IHC tool listed is high value."
    },
    {
      "kind": "follow_up",
      "who": null,
      "org": null,
      "reason": "the june 15 billing split moves your harness onto a capped credit pool at api list prices. you need to estimate your daily harness token spend and decide whether to set max_budget_usd or the new token cap before it goes live, or the assistant could stall mid run."
    }
  ],
  "citedCount": 15,
  "itemCount": 20,
  "actionCount": 8
} as const;
