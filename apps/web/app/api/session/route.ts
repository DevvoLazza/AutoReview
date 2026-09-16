import { z } from "zod";
import {
  checkOrigin,
  clearSession,
  currentToken,
  demoMode,
  identity,
  readSession,
  writeSession,
} from "@/lib/session";

export async function GET() {
  try {
    return Response.json(
      { authenticated: demoMode() || Boolean(await currentToken()), demo: demoMode() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    await clearSession();
    return Response.json({ authenticated: false, demo: false });
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = z
      .discriminatedUnion("action", [
        z.object({
          action: z.literal("signin"),
          email: z.email(),
          password: z.string().min(1).max(512),
        }),
        z.object({
          action: z.literal("mfa"),
          mfaPendingCredential: z.string().max(8000),
          mfaEnrollmentId: z.string().max(500),
          code: z.string().regex(/^\d{6}$/),
        }),
        z.object({ action: z.literal("reset"), email: z.email() }),
        z.object({ action: z.literal("enroll-start") }),
        z.object({
          action: z.literal("enroll-finish"),
          sessionInfo: z.string().max(8000),
          code: z.string().regex(/^\d{6}$/),
        }),
        z.object({ action: z.literal("verify-email") }),
      ])
      .parse(await request.json());
    const client = identity();
    if (input.action === "signin") {
      const result = await client.signIn(input.email, input.password);
      if ("challenge" in result) return Response.json({ challenge: result.challenge });
      await writeSession(result.session);
      return Response.json({ authenticated: true });
    }
    if (input.action === "mfa") {
      await writeSession(await client.verifyMfa(input, input.code));
      return Response.json({ authenticated: true });
    }
    if (input.action === "reset") {
      try {
        await client.resetPassword(input.email);
      } catch {
        // Return the same message on unknown accounts to prevent account enumeration.
        return Response.json({ message: "Se l'account esiste, riceverai un'email di recupero." });
      }
      return Response.json({ message: "Se l'account esiste, riceverai un'email di recupero." });
    }
    const token = await currentToken();
    if (!token || !(await readSession()))
      return Response.json({ message: "Accedi prima di continuare" }, { status: 401 });
    if (input.action === "enroll-start") return Response.json(await client.startEnrollment(token));
    if (input.action === "enroll-finish") {
      await client.finishEnrollment(token, input.sessionInfo, input.code);
      await clearSession();
      return Response.json({
        message: "MFA attivata. Accedi nuovamente con il codice del tuo authenticator.",
      });
    }
    await client.sendVerification(token);
    return Response.json({ message: "Email di verifica inviata." });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof z.ZodError
            ? "Controlla i campi inseriti"
            : error instanceof Error
              ? error.message
              : "Accesso non riuscito",
      },
      { status: 400 },
    );
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    await clearSession();
    return Response.json({ signedOut: true });
  } catch {
    return Response.json({ message: "Operazione non autorizzata" }, { status: 403 });
  }
}
