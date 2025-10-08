declare module "better-auth" {
  export type Auth = any;
  export function betterAuth(...args: unknown[]): Auth;
}

declare module "better-auth/adapters/drizzle" {
  export function drizzleAdapter(...args: unknown[]): any;
}

declare module "better-auth/social-providers" {
  export const google: unknown;
  export const microsoft: unknown;
  export type SocialProviders = Record<string, unknown>;
}
