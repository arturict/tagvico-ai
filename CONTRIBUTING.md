## Contributing

Tagvico AI requires Node.js 22 and npm. Before starting substantial work, open
an issue or comment on an existing one so that implementation direction can be
agreed without duplicating effort.

1. Fork the repository and create a focused branch.
2. Install the locked dependencies with `npm ci`.
3. Make the smallest change that addresses the issue and add regression tests
   for behavior changes.
4. Run `npm test`, which performs type checking, linting, repository policy
   checks, a production build, and the unit-test suite.
5. Open a pull request using the repository template and explain how the change
   was verified.

Pull requests are expected to keep unrelated refactors out of the diff, avoid
committing secrets or personal document data, and update user-facing
documentation when configuration or behavior changes. AI-assisted
contributions are welcome when the contributor has reviewed the patch, can
explain it, and reports the verification they personally performed.

## Issue Staleness Policy

To keep the issue tracker focused on active work, we use a stale-bot workflow with relaxed, contributor-friendly defaults:

- **Days before stale:** 60 days of inactivity before an issue is marked as stale.
- **Days before close:** 30 days after being marked stale before the issue is closed (giving 90 days of total inactivity before closure).
- **Exempt labels:** Issues with any of the following labels are exempt from the stale-bot entirely and will never be auto-closed:
  - `wontfix`
  - `bug`
  - `security`
  - `roadmap`
  - `help wanted`

If your issue is closed as stale and you would like it reopened, simply add a comment (or remove the `stale` label) and the bot will re-evaluate. If your work belongs to one of the exempt categories above, please apply the appropriate label and the issue will be left alone regardless of activity.
