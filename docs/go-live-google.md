# Google Business Profile pilot acceptance

## Current boundary

The code supports a controlled, manually approved pilot. No approved Google project or real location has been supplied for this implementation. Do not enable real publication, advertise production certification, or sell indirect API access based only on a working local demo.

Review Google's current [prerequisites](https://developers.google.com/my-business/content/prereqs), [review API guidance](https://developers.google.com/my-business/content/review-data), [notification setup](https://developers.google.com/my-business/content/notification-setup), and [policies](https://developers.google.com/my-business/content/policies) before deployment. Google does not provide a complete dedicated sandbox for this workflow.

## Approval and authorization

1. Confirm verified business ownership, profile eligibility, organization/account prerequisites and API-access approval.
2. Obtain an approved dedicated Cloud project and authorized billing/deployment operator.
3. Configure OAuth consent, verified domains, privacy disclosures and exact callback URI.
4. Obtain written clarification from Google before commercial multi-tenant SaaS operation or automatic responses for third-party customers. Specific consent in this app does not independently establish Google's approval of the business model.

## Technical setup

Follow [setup and migration order](setup.md). Select `GOOGLE_MODE=live`, `AUTH_MODE=identity`, `STORAGE_MODE=postgres`, `AI_MODE=live`, `EMBEDDING_MODE=vertex` and `TASKS_MODE=live` only with configured real services. Keep `AUTOMATION_RELEASE_APPROVED=false` and the global kill switch on.

- Enable the required Business Profile Account Management, Business Information, Notifications and review API access. Review API availability/quota must be checked in the approved project, not inferred from Terraform service enablement.
- Grant the documented Google publisher access to the review topic and confirm authenticated Pub/Sub push, retry and DLQ permissions.
- Verify the same configured worker OIDC audience across Pub/Sub, Tasks and Scheduler.
- Validate Identity accounts, verified email, custom claims, TOTP and grant revocation.
- Verify runtime SQL privileges/RLS, KMS, reviewed AI providers, optional logging disabled, embedding quota/region and any international-processing terms.
- In dashboard settings: connect Google, discover authorized resources, explicitly consent to importing a location, then sync its review pages. Import does not automatically approve or publish historic reviews.

## Real-location acceptance record

Use accounts/data you control. A reviewer should record the deployed image digests, configuration/model versions, test time and outcomes without storing customer content in public artifacts.

| Scenario | Required observation |
| --- | --- |
| New review | Canonical import, correct location/language, grounded draft and visible sources |
| Edited review | Previous draft invalidated; manual reassessment required |
| Duplicate / concurrent events | One active generation; completed redelivery safely acknowledged |
| Human correction | Manual edit/revision persists and never mutates approved knowledge |
| Retired or changed source | Affected draft cannot publish without reassessment |
| Competing approvers | Only one reply PUT; stale command handled visibly |
| Accepted PUT / lost response | Persisted `publishing`; GET-only recovery confirms without another PUT |
| Google 429 / 5xx / revoked OAuth | Safe error/attention state, retry or reconnect available, no blind publication |
| Existing Google reply | No unapproved overwrite |
| Physical push | Generic payload, correct authenticated route, permission refusal and inbox fallback |
| Account/grant revocation | Old credentials no longer authorize requests |
| Disconnect | Local tokens/content removed; remote cleanup confirmed or clearly pending |
| Expiry and backup restore | Timely physical purge and no retained/restored content beyond allowed lifetime |
| Failed queues/services | Alerts delivered to operator; DLQ recovery preserves original event identity |

Only after a successful manual pilot, multilingual adversarial evaluations, policy confirmation and operator review may automation be considered. Evaluate every supported rating/language/category combination; require 20 confirmed manual approvals per location and confirm owner MFA/consent, cancellation window, daily limits and kill switch at delivery.

## Distribution and operational release

Complete physical iOS/Android testing, APNs/FCM configuration, signed builds, TestFlight/Play internal testing, accessibility checks, privacy policy, contractual/DPA/SCC review, store declarations, incident response and backup restoration. No cloud deployment, signed app, store approval or real-account test has been performed merely by merging this repository.
