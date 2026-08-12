import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export default function SsoCallbackPage() {
    return (
        <>
            <AuthenticateWithRedirectCallback />
            <div id="clerk-captcha" className="flex min-h-svh justify-center" />
        </>
    );
}
