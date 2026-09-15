# Sicurezza e privacy

## Proprietà da preservare

- un tenant non può leggere o modificare dati di un altro tenant;
- nessuna pubblicazione senza approvazione valida o regola attiva e consentita;
- gli hard stop non sono disattivabili da prompt, regola o ruolo;
- il modello non possiede token Google, funzioni o accesso di rete arbitrario;
- recensioni, prompt e risposte non finiscono nei log tecnici;
- i contenuti Google temporanei vengono rimossi entro 30 giorni;
- ogni decisione è riconducibile ad attore, versione, modello, provider e memoria.

## Controlli implementati

- JSON Schema su input/output AI e secondo passaggio di validazione indipendente;
- rilevazione deterministica di minacce legali, salute, frodi, rimborsi, PII, violenza e prompt injection;
- ZDR, `data_collection=deny`, allowlist provider e snapshot modello fissato;
- OAuth state firmato e scadenza a 10 minuti;
- JWT Identity Platform, ruoli e MFA per azioni sensibili;
- OIDC Google sul worker e autenticazione separata worker/API;
- optimistic locking, deduplica eventi, rilettura canonica e audit append-only;
- Secret Manager, KMS, storage privato, Cloud SQL privato, backup e PITR.

## Controlli da completare prima della produzione

- sostituire `MemoryStore` con il repository PostgreSQL transazionale e test RLS su database reale;
- integrare cifratura/decrittazione KMS dei refresh token nel repository;
- abilitare MFA effettiva in Identity Platform e testare i claim;
- eseguire DAST, dependency scan, restore backup e test di isolamento;
- completare DPIA, DPA/SCC e verifica dell'endpoint UE OpenRouter se richiesta;
- definire alert, runbook DLQ, rotazione segreti e procedura di incidente.
