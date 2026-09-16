/** Identity Platform REST client shared by the server-side web session and native app. */
export type IdentitySession = { idToken: string; refreshToken: string; expiresAt: number };
export type MfaChallenge = { mfaPendingCredential: string; mfaEnrollmentId: string };
export type TotpEnrollment = {
  sharedSecretKey: string;
  sessionInfo: string;
  verificationCodeLength: number;
  periodSec: number;
  hashingAlgorithm: string;
};

export class IdentityClient {
  constructor(
    private readonly apiKey: string,
    private readonly request: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new Error("Autenticazione non configurata");
  }
  private async call<T>(method: string, body: unknown, version = "v1"): Promise<T> {
    const response = await this.request(
      `https://identitytoolkit.googleapis.com/${version}/${method}?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const payload = (await response.json()) as T & { error?: { message?: string } };
    if (!response.ok) {
      const code = payload.error?.message?.split(" : ")[0];
      const messages: Record<string, string> = {
        INVALID_LOGIN_CREDENTIALS: "Email o password non corretti",
        EMAIL_NOT_FOUND: "Email o password non corretti",
        INVALID_PASSWORD: "Email o password non corretti",
        INVALID_MFA_CODE: "Codice MFA non corretto",
        TOO_MANY_ATTEMPTS_TRY_LATER: "Troppi tentativi: riprova più tardi",
        TOKEN_EXPIRED: "Sessione scaduta: accedi nuovamente",
        INVALID_ID_TOKEN: "Sessione scaduta: accedi nuovamente",
        USER_DISABLED: "Account disabilitato",
        UNVERIFIED_EMAIL: "Verifica prima il tuo indirizzo email",
      };
      throw new Error(
        messages[code ?? ""] ??
          "Autenticazione non riuscita. Verifica la configurazione o riprova.",
      );
    }
    return payload;
  }
  private session(payload: {
    idToken: string;
    refreshToken: string;
    expiresIn?: string;
  }): IdentitySession {
    return {
      idToken: payload.idToken,
      refreshToken: payload.refreshToken,
      expiresAt: Date.now() + Number(payload.expiresIn ?? 3600) * 1000,
    };
  }
  async signIn(
    email: string,
    password: string,
  ): Promise<{ session: IdentitySession } | { challenge: MfaChallenge }> {
    const payload = await this.call<{
      idToken?: string;
      refreshToken?: string;
      expiresIn?: string;
      mfaPendingCredential?: string;
      mfaInfo?: Array<{ mfaEnrollmentId: string; totpInfo?: unknown }>;
    }>("accounts:signInWithPassword", { email, password, returnSecureToken: true });
    if (payload.mfaPendingCredential) {
      const factor = payload.mfaInfo?.find((info) => info.totpInfo);
      if (!factor)
        throw new Error(
          "Questo account richiede un fattore non supportato. Configura TOTP dalla console Identity Platform.",
        );
      return {
        challenge: {
          mfaPendingCredential: payload.mfaPendingCredential,
          mfaEnrollmentId: factor.mfaEnrollmentId,
        },
      };
    }
    if (!payload.idToken || !payload.refreshToken) throw new Error("Sessione non valida");
    return {
      session: this.session({
        ...payload,
        idToken: payload.idToken,
        refreshToken: payload.refreshToken,
      }),
    };
  }
  async verifyMfa(challenge: MfaChallenge, code: string): Promise<IdentitySession> {
    return this.session(
      await this.call(
        "accounts/mfaSignIn:finalize",
        { ...challenge, totpVerificationInfo: { verificationCode: code } },
        "v2",
      ),
    );
  }
  async refresh(refreshToken: string): Promise<IdentitySession> {
    const response = await this.request(
      `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) throw new Error("Sessione scaduta: accedi nuovamente");
    const payload = (await response.json()) as {
      id_token: string;
      refresh_token: string;
      expires_in: string;
    };
    return this.session({
      idToken: payload.id_token,
      refreshToken: payload.refresh_token,
      expiresIn: payload.expires_in,
    });
  }
  async startEnrollment(idToken: string): Promise<TotpEnrollment> {
    return (
      await this.call<{ totpSessionInfo: TotpEnrollment }>(
        "accounts/mfaEnrollment:start",
        { idToken, totpEnrollmentInfo: {} },
        "v2",
      )
    ).totpSessionInfo;
  }
  async finishEnrollment(
    idToken: string,
    sessionInfo: string,
    verificationCode: string,
  ): Promise<IdentitySession> {
    return this.session(
      await this.call(
        "accounts/mfaEnrollment:finalize",
        {
          idToken,
          displayName: "AutoReview authenticator",
          totpVerificationInfo: { sessionInfo, verificationCode },
        },
        "v2",
      ),
    );
  }
  async resetPassword(email: string): Promise<void> {
    await this.call("accounts:sendOobCode", { requestType: "PASSWORD_RESET", email });
  }
  async sendVerification(idToken: string): Promise<void> {
    await this.call("accounts:sendOobCode", { requestType: "VERIFY_EMAIL", idToken });
  }
}
