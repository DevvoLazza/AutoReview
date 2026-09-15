import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { RequestPrincipal, Role } from "@reviewguard/contracts";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { DEMO_TENANT_ID, DEMO_USER_ID } from "./demo.js";

const principalKey = Symbol("requestPrincipal");
const rolesKey = "reviewguard.roles";
const publicKey = "reviewguard.public";

type RequestWithPrincipal = {
  headers: Record<string, string | string[] | undefined>;
  [principalKey]?: RequestPrincipal;
};

const claimsSchema = z.object({
  sub: z.string(),
  tenant_id: z.string().uuid(),
  app_user_id: z.string().uuid(),
  role: z.enum(["owner", "admin", "editor", "approver"]),
  firebase: z.object({ sign_in_second_factor: z.string().optional() }).optional(),
});

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(publicKey, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const mode = process.env.AUTH_MODE ?? "demo";
    if (mode === "demo" && process.env.NODE_ENV !== "production") {
      request[principalKey] = {
        userId: header(request, "x-user-id") ?? DEMO_USER_ID,
        tenantId: header(request, "x-tenant-id") ?? DEMO_TENANT_ID,
        role: (header(request, "x-role") as Role | undefined) ?? "owner",
        mfaVerified: header(request, "x-mfa-verified") !== "false",
      };
      return true;
    }

    const projectId = process.env.IDENTITY_PROJECT_ID;
    const authorization = header(request, "authorization");
    if (!projectId || !authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("A valid Identity Platform token is required");
    }
    const token = authorization.slice("Bearer ".length);
    const jwks = createRemoteJWKSet(
      new URL(
        "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
      ),
    );
    const result = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    const claims = claimsSchema.parse(result.payload);
    request[principalKey] = {
      userId: claims.app_user_id,
      tenantId: claims.tenant_id,
      role: claims.role,
      mfaVerified: Boolean(claims.firebase?.sign_in_second_factor),
    };
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<readonly Role[]>(rolesKey, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed) return true;
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const principal = request[principalKey];
    if (!principal || !allowed.includes(principal.role)) {
      throw new ForbiddenException("Your role cannot perform this action");
    }
    return true;
  }
}

export const Roles = (...roles: Role[]) => SetMetadata(rolesKey, roles);
export const Public = () => SetMetadata(publicKey, true);
export const Principal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestPrincipal => {
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    if (!request[principalKey]) throw new UnauthorizedException();
    return request[principalKey];
  },
);

function header(request: RequestWithPrincipal, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
