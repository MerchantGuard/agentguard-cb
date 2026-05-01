# Pull Request

## Summary

Briefly describe the change.

## Type of change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation only

## DCO sign-off

- [ ] All commits in this PR are signed off under the Developer Certificate of Origin v1.1 (`git commit -s`). See `DCO.md`.

## Hard-rule checks (see `CONTRIBUTING.md`)

- [ ] No new runtime dependencies on `openai`, `anthropic`, `langchain`, `gemini`, `groq`, `mistral`, `llama`, `cohere`, `replicate`, `together-ai`, or any LLM/generative-text package.
- [ ] No new evidence fields named `narrative`, `freeform`, `freeform_text`, `generatedText`, `aiSummary`, `llm`, or any synonym.
- [ ] No new `uncategorized_text` usage in production code paths.
- [ ] No new `as any` casts outside the documented Stripe type-boundary file.
- [ ] CI is green (`typecheck`, `lint`, `test`, `build`, all anti-fabrication grep guards).

## No personal data in PR description

- [ ] This PR description and the diff do not contain real customer email addresses, payment data, dispute evidence, or other personally identifying information. Test fixtures use placeholder values (`cus_REDACTED`, `customer@example.com`, `192.0.2.1`, etc.).

## Tests

Describe the tests added or updated.

## Related issues

Fixes #
