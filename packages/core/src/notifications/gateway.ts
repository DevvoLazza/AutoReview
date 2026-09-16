export interface PushMessage {
  userIds: readonly string[];
  title: string;
  body: string;
  route: string;
  category: "approval_required" | "auto_scheduled" | "published" | "needs_attention";
}

export interface NotificationGateway {
  send(message: PushMessage): Promise<void>;
}

export class ConsoleNotificationGateway implements NotificationGateway {
  async send(message: PushMessage): Promise<void> {
    console.info("notification", {
      users: message.userIds.length,
      category: message.category,
      route: message.route,
    });
  }
}

export class ExpoNotificationGateway implements NotificationGateway {
  constructor(
    private readonly getTokens: (userIds: readonly string[]) => Promise<string[]>,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly removeInvalidToken: (token: string) => Promise<void> = async () => {},
    private readonly accessToken?: string,
  ) {}

  async send(message: PushMessage): Promise<void> {
    const tokens = [...new Set(await this.getTokens(message.userIds))];
    if (tokens.length === 0) return;
    for (let offset = 0; offset < tokens.length; offset += 100) {
      const batch = tokens.slice(offset, offset + 100);
      const response = await this.fetchImpl("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(
          batch.map((to) => ({
            to,
            title: message.title,
            body: message.body,
            data: { route: message.route, category: message.category },
            sound: "default",
          })),
        ),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Expo push submission failed with ${response.status}`);
      const payload = (await response.json()) as {
        data?: Array<{ status: string; details?: { error?: string } }>;
      };
      if (!Array.isArray(payload.data) || payload.data.length !== batch.length)
        throw new Error("Expo returned invalid push tickets");
      let retryRequired = false;
      for (const [index, ticket] of payload.data.entries()) {
        if (ticket.status === "ok") continue;
        if (ticket.details?.error === "DeviceNotRegistered") {
          const token = batch[index];
          if (token) await this.removeInvalidToken(token);
        } else retryRequired = true;
      }
      if (retryRequired) throw new Error("Expo rejected push submission; retry required");
    }
  }
}
