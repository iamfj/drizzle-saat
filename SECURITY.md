# Security Policy

## Supported Versions

`saat` is pre-1.0. Security fixes are applied to the latest published release on
the `main` branch.

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |
| older   | :x:                |

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, report them privately via GitHub's
[private vulnerability reporting](https://github.com/iamfj/saat/security/advisories/new),
or by email to **fabian@jocks.io**.

Include as much detail as you can:

- A description of the vulnerability and its impact
- Steps to reproduce, or a proof of concept
- Affected version(s)

You can expect an initial response within a few days. Once the issue is
confirmed, a fix will be prepared and released, and the report will be
acknowledged in the release notes (unless you prefer to remain anonymous).

## Scope

`saat` is a development and testing tool that generates throwaway fake data and
performs wipe-and-reseed operations. It is **not** intended for production use.
Keep this in mind when assessing impact — never point it at a production
database.
