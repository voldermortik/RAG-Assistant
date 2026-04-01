"use client";

import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { getSession } from "next-auth/react";
import superjson from "superjson";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const trpc = createTRPCReact<any>();

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/trpc`,
        transformer: superjson,
        async headers() {
          const session = await getSession();
          const accessToken = (
            session as typeof session & { accessToken?: string }
          )?.accessToken;
          return {
            ...(accessToken
              ? { Authorization: `Bearer ${accessToken}` }
              : {}),
          };
        },
      }),
    ],
  });
}
