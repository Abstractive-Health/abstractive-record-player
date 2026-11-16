# Contributing to Record Player

Thanks for helping. Record Player is a sample SMART on FHIR app from Abstractive Health, kept small
on purpose so it's easy to learn from and fork.

## Ground rules

- **No patient data, ever.** Don't commit real or realistic patient records, screenshots of
  charts, tokens or logs from a launch. Use made-up summaries in tests.
- **Keep it frontend-only.** No backend, database, analytics, cookies or user accounts.
- **Keep patient-derived text in the browser.** Don't add network calls that send anything derived
  from the summary, and don't loosen the CSP in `public/_headers` without saying why.
- **Keep the UI minimal:** the song, play/pause and volume.

## Making a change

1. Fork the repository and branch from `main`.
2. Run `npm ci`, then `npm run lint` and `npm test` before you push.
3. Open a pull request that explains what changed and why.

Pull requests need passing CI and an approving review. For now, only Abstractive
Health employees can merge to `main`.

## Changing the music catalog

Regenerate it with `npm run build:catalog` (or the **Refresh music catalog** GitHub Action) rather
than editing `src/catalog/tracks.json` by hand. Only CC0, Public Domain Mark, CC BY and CC BY-SA
tracks may be added, with attribution in `ATTRIBUTIONS.md`.
