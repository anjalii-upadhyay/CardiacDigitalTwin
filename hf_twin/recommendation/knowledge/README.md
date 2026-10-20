# Recommendation knowledge base

`guideline_excerpts.json` is the **only** context the recommendation step may use.

Rules:
- Every excerpt is copied **verbatim** from the primary PDF and checked against the page image (page numbers given).
- Sources: 2022 AHA/ACC/HFSA heart-failure guideline (current US guideline) and the 2018 Cardiological Society of
  India position statement. The 2026 ESC heart-failure guideline is **pending** (PDF not yet obtained).
- Dose tables are **clinician reference only**; the app never turns them into a patient-specific dose.
- The PDFs themselves are kept outside the repo (`D:/CardiacDigitalTwin_data/guidelines/`) for copyright reasons.
- Clinically accepted cut-offs used by the twin come from CSI 2018 Fig. 7 (p. S20): congestion = wedge pressure
  above 18 mmHg; low perfusion = cardiac index below 2.2 L/min/m2.
- Low blood pressure = systolic below 90 mmHg, from AHA/ACC/HFSA 2022 p. e966 ("Hypotension (eg, SBP <90 mm Hg)",
  Tables 22-23; an example value, not enough alone to diagnose shock). Excerpts `AHA-9.5-SHOCKTEXT` and `AHA-T23`.
  Footer check: a page's footer ("e965") sits at the BOTTOM of the page, so text after that marker in the .txt belongs to the next page.
- That low flow or low pressure always leads to a clinician review is a safety choice of the team (journey D37), not a guideline sentence.
- The ESC 2026 PDF (`ehag100.pdf`) is in the guidelines folder but has not been read or excerpted yet.
- Ideally a clinician reviews this file before the demo.
