import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        try {
          const res = await fetch(
            `${process.env.API_URL ?? "http://localhost:8000"}/api/v1/auth/login`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, password }),
            }
          );

          if (!res.ok) return null;

          const data = await res.json() as {
            user: {
              id: string;
              email: string;
              name: string;
              image?: string;
              orgId?: string;
              role?: string;
            };
            accessToken: string;
          };

          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            image: data.user.image,
            accessToken: data.accessToken,
            orgId: data.user.orgId,
            role: data.user.role,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard =
        !nextUrl.pathname.startsWith("/login") &&
        !nextUrl.pathname.startsWith("/register") &&
        !nextUrl.pathname.startsWith("/api/auth");

      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false;
      } else if (isLoggedIn) {
        // If logged in user has no org, redirect to onboarding
        const user = auth.user as typeof auth.user & { orgId?: string };
        if (!user.orgId && !nextUrl.pathname.startsWith("/onboarding")) {
          return Response.redirect(new URL("/onboarding", nextUrl));
        }
        if (
          nextUrl.pathname === "/login" ||
          nextUrl.pathname === "/register"
        ) {
          return Response.redirect(new URL("/workflows", nextUrl));
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        const u = user as typeof user & {
          accessToken?: string;
          orgId?: string;
          role?: string;
        };
        token.accessToken = u.accessToken;
        token.orgId = u.orgId;
        token.role = u.role;
        token.id = u.id;
      }
      if (account?.provider === "google") {
        // Exchange Google token for our API token
        try {
          const res = await fetch(
            `${process.env.API_URL ?? "http://localhost:8000"}/api/v1/auth/google`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: token.email,
                name: token.name,
                image: token.picture,
                googleId: account.providerAccountId,
              }),
            }
          );
          if (res.ok) {
            const data = await res.json() as {
              accessToken: string;
              orgId?: string;
              role?: string;
              id: string;
            };
            token.accessToken = data.accessToken;
            token.orgId = data.orgId;
            token.role = data.role;
            token.id = data.id;
          }
        } catch {
          // Fall through
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        (session as typeof session & { accessToken?: string }).accessToken =
          token.accessToken as string | undefined;
        (session.user as typeof session.user & { orgId?: string; role?: string }).orgId =
          token.orgId as string | undefined;
        (session.user as typeof session.user & { orgId?: string; role?: string }).role =
          token.role as string | undefined;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
};
