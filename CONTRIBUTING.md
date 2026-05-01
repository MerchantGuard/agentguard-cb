# Contributing

Thanks for considering a contribution. Before you open a PR, please read this in full.

## Sign-off required (DCO)

**Every commit must be signed off** under the Developer Certificate of Origin v1.1 (see `DCO.md`). Use `git commit -s` to add the `Signed-off-by:` trailer automatically. CI will reject PRs whose commits lack the trailer.

If you've already pushed unsigned commits:
```bash
git rebase HEAD~N --signoff
git push --force-with-lease
```

The DCO replaces a CLA. By signing off, you certify that you have the right to contribute the code under this project's MIT License. You retain copyright in your contribution; inbound license = outbound license = MIT.

If your employer has rights to IP you create that includes your contributions, you must have permission from your employer (or a waiver) before signing off.

## Hard rules — PRs that violate these will be rejected

1. **No LLM-generated narrative features.** No imports of `openai`, `anthropic`, `langchain`, `@langchain/*`, `ai` SDK, or any other generative-text runtime dependency. CI will reject the PR.
2. **No arbitrary text boxes for dispute evidence.** No fields named `narrative`, `freeform`, `generatedText`, `aiSummary`, `llm`, or any synonym. Evidence schemas live in `lib/evidence/schemas.ts` and are strictly typed.
3. **No `uncategorized_text` in Stripe submission.** Stripe accepts free-text via `evidence.uncategorized_text`; this tool deliberately doesn't use it. The PDF carries narrative-equivalent context; merchant systems must NOT inject paragraph-shaped strings.
4. **No `as any` casts** outside the documented Stripe type-boundary file (if one exists). All evidence values must be typed.
5. **Schema changes require tests.** `npm test` must pass on the new schema before merge.
6. **Adapter changes require zod validation tests.** New adapters must validate their output before returning.
7. **Stripe payload changes require exact-shape tests.** If you touch `lib/evidence/ce3.ts` or `lib/stripe/submit.ts`, add a test that asserts the JSON payload structure.
8. **Docs must cite primary sources.** Visa Core Rules, Stripe API ref, etc. — not blog posts. The Verified-Facts Appendix at `docs/verified-facts-stripe-visa-ce3.md` is the canonical CE 3.0 reference.

## Style

- TypeScript strict mode. `npm run typecheck` must pass.
- ESLint via `npm run lint`.
- Vitest for tests; aim for fixture-driven over mock-heavy.
- Conventional commits welcome but not required.

## Reporting bugs

Open a GitHub issue with:
- Repro steps
- Expected vs actual
- Stripe API version (`npm run stripe:version`)
- Adapter being used

For security-sensitive bugs, see `SECURITY.md`.

## Releases

Versioned via SemVer. Major bumps for breaking schema or adapter API changes.
