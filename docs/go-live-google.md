# Go-live Google Business Profile

## Go/no-go obbligatorio

- Il profilo deve rispettare i prerequisiti Google, essere verificato e controllato dall'organizzazione.
- Il progetto Cloud deve ottenere l'accesso alle Business Profile APIs.
- OAuth consent screen, redirect URI, privacy policy e dominio devono essere verificati.
- Il proprietario collega esplicitamente ogni account e sede; nessun accesso indiretto è esposto ai clienti.
- Prima di vendere il prodotto come SaaS, ottenere da Google una conferma scritta sul modello multi-tenant e sulle regole automatiche.

## Configurazione tecnica

1. Creare le credenziali OAuth Web e impostare il callback `/v1/integrations/google/callback`.
2. Abilitare `My Business Account Management`, `Business Information`, `Business Profile Performance` e gli endpoint recensioni necessari.
3. Collegare il topic Pub/Sub alla configurazione notifiche di Google Business Profile.
4. Concedere al publisher Google indicato dalla documentazione corrente il diritto di pubblicare sul topic.
5. Configurare il service account push e l'audience del worker Cloud Run.
6. Impostare `GOOGLE_ADAPTER=live`, salvare i refresh token cifrati con KMS e provare revoca/riconnessione.

## Spike di accettazione

Usare una sola sede reale e automazione disattivata:

1. ricevere una recensione nuova e una modificata;
2. verificare redelivery duplicata senza doppia pratica;
3. generare una bozza e controllare fonti/lingua;
4. approvare da un dispositivo fisico;
5. rileggere la recensione e pubblicare una sola risposta;
6. confermare la risposta su Google e nell'audit;
7. revocare OAuth e verificare `needs_attention` senza perdita eventi;
8. eseguire la cancellazione dei contenuti scaduti.

Google non offre un sandbox completo: l'adapter simulato copre CI e sviluppo, ma non sostituisce questa prova.
