# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Forensic document examiners who compare a questioned signature against known standards and sign their opinion. Organization admins oversee cases and teams.

## Product Purpose
Avera (Automated Verification & Explainable Recognition of Authorship) supports signature verification with an AI comparison and explainable visual aids. The Examination page adds the examiner's own manual workflow, from images to a signed report. Success means an examiner produces a report at least as complete as their paper method, with less repetitive work.

## Positioning
AI analysis and a manual examination live in one workspace, and the examiner forms their opinion before seeing the AI result.

## Operating Context
Physical practice this mirrors: print each signature, draw numbered arrows to stroke features using the same number on every signature, cut a comparison chart of those features, fill general and specific description tables, write a conclusion, then sign. Reference samples came from a university crime laboratory.

## Capabilities and Constraints
- An examination has exactly 1 questioned signature and 4 to 8 references (5 to 9 images). Both minimums must be met before the steps after Images open.
- The AI analysis pipeline accepts exactly 4 references and 1 questioned signature.
- Backend endpoints for saving examinations do not exist yet. See `docs/examination/AUDIT.md`.
- Marking requires a screen 768px or wider. Phones are view and download only.

## Brand Commitments
Exported reports carry the organization's letterhead, with a small "Prepared with Avera" footer. Do not use "Canva" in the product; the page is called Examination.

## Evidence on Hand
- The existing Avera report is an example of current output.
- Scanned sample reports belong to a real case. Do not ship them as sample or demo content.
- No testimonials, accreditation or accuracy claims exist for this feature. Do not invent any. Avera's disclaimer says it is not a certified or legally accredited forensic tool.

## Product Principles
- The opinion belongs to the examiner: nothing pre-fills a verdict or remark.
- Automate the repetition and leave the judgment alone.
- Every automatic row, column and crop can be overridden.
- Show one decision at a time, and allow free movement between steps.
