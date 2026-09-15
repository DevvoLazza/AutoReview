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
  ) {}

  async send(message: PushMessage): Promise<void> {
    const tokens = await this.getTokens(message.userIds);
    if (tokens.length === 0) return;
    const response = await this.fetchImpl("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(
        tokens.map((to) => ({
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
  }
}
