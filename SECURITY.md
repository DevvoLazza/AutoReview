# Security Policy

AutoReview handles authentication, business knowledge, Google OAuth credentials, and customer review workflows. Security reports are taken seriously and should be disclosed privately.

## Supported versions

AutoReview is currently an early-stage pilot without numbered production releases.

| Version | Security support |
| --- | --- |
| Latest commit on `main` | Supported |
| `dev` and other pre-release branches | Best effort |
| Older commits, forks, and modified deployments | Not supported |

## Reporting a vulnerability

Do not disclose vulnerabilities, credentials, personal data, or proof-of-concept exploits in a public issue.

1. Use GitHub’s private vulnerability reporting or Security Advisory flow for this repository when available.
2. Include the affected component, impact, prerequisites, reproduction steps, and a minimal proof of concept.
3. Remove real credentials, customer data, review content, and personal information from the report.
4. If private reporting is unavailable, open a public issue titled **Security contact request** without technical details and wait for a private communication channel.

Please allow maintainers time to reproduce and remediate the issue before any public disclosure. Coordinated disclosure timelines will be agreed upon based on severity, exploitability, and release requirements.

## What to report

Reports are especially valuable when they involve:

- cross-tenant access or authorization bypass;
- unauthorized Google review publication;
- OAuth, JWT, MFA, or service-identity failures;
- exposure of credentials, review content, prompts, or personal data;
- bypasses of hard stops, consent, or automation safeguards;
- duplicate publication through retries or concurrency;
- prompt injection that crosses the model/application trust boundary;
- retention or deletion failures affecting Google-derived data;
- vulnerabilities in deployed infrastructure or the software supply chain.

## Out of scope

The following are generally not security vulnerabilities unless they produce a concrete security impact:

- missing production credentials in the demonstration environment;
- vulnerabilities that require a deliberately modified or unsupported deployment;
- reports based only on automated scanner output without a reproducible impact;
- denial-of-service reports that do not demonstrate a realistic attack path;
- social engineering, physical attacks, or attacks against third-party services outside AutoReview’s control.

## Safe-harbor intent

Good-faith research that respects privacy, avoids service disruption, uses only accounts and data you control, and follows this policy is welcome. Do not access other tenants’ data, publish replies to real businesses, retain personal data, or degrade third-party services while testing.

For implementation details, trust boundaries, and production security gates, see the [engineering security model](docs/security.md).
