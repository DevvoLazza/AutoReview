# Contratto API

La specifica OpenAPI è generata dall'API in `/openapi.json`; Swagger UI è disponibile in `/docs`.

Header demo locali:

```text
x-tenant-id: 11111111-1111-4111-8111-111111111111
x-user-id: 22222222-2222-4222-8222-222222222222
x-role: owner
x-mfa-verified: true
```

In produzione questi header sono ignorati e serve un JWT Identity Platform. Endpoint principali:

- `GET /v1/reviews`
- `POST /v1/reviews/:id/generate`
- `POST /v1/reviews/:id/revise`
- `POST /v1/reviews/:id/edit`
- `POST /v1/reviews/:id/approve`
- `POST /v1/reviews/:id/reject`
- `POST /v1/reviews/:id/cancel-schedule`
- `GET|POST /v1/knowledge`
- `GET|POST /v1/automation-rules`
- `POST /v1/devices`
- `GET /v1/integrations/google/start`

Tutti i comandi sul workflow richiedono `expectedVersion`. I callback Google e gli endpoint interni hanno autenticazione dedicata e non sono API pubbliche per clienti.
