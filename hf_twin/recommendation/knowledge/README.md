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
- Ideally a clinician reviews this file before the demo.
