import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
    contentSecurityPolicy,
    generateNonce,
} from "@/lib/content-security-policy";

const isProtectedRoute = createRouteMatcher([
    "/dashboard(.*)",
    "/workspace(.*)",
    "/settings(.*)",
    // Redeeming a share link requires an account: a notebook's members must
    // always be people the owner can see and remove.
    "/invite(.*)",
    "/share(.*)",
]);

export const proxy = clerkMiddleware(async (auth, request) => {
    if (isProtectedRoute(request)) {
        await auth.protect();
    }

    // The script nonce has to be minted per request, which a static
    // `headers()` entry in `next.config.ts` cannot do. Setting the policy on
    // the *request* as well as the response is what lets Next stamp the nonce
    // onto its inline bootstrap scripts and Clerk onto its script tags; without
    // it those scripts are blocked, the app never hydrates, and Clerk never
    // loads.
    const nonce = generateNonce();
    const policy = contentSecurityPolicy(nonce);

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("content-security-policy", policy);
    requestHeaders.set("x-nonce", nonce);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("content-security-policy", policy);

    return response;
});

export const config = {
    matcher: [
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        "/(api|trpc)(.*)",
    ],
};
