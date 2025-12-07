type SocialProvider = "google" | "microsoft";

async function signInWithProvider(provider: SocialProvider) {
  const providerLabel = provider === "google" ? "Google" : "Microsoft";
  try {
    const returnUrl = window.location.href;

    const response = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider,
        callbackURL: returnUrl,
        errorCallbackURL: returnUrl,
      }),
    });

    if (!response.ok) {
      throw new Error(`Sign-in request failed (${response.status})`);
    }

    const data: { url?: string; redirect?: boolean } = await response.json();

    if (!data.url) {
      throw new Error(`Missing ${providerLabel} authorization URL`);
    }

    window.location.assign(data.url);
  } catch (error) {
    console.error(`${provider} sign-in failed`, error);
    alert(`Failed to sign in with ${providerLabel}. Please try again.`);
  }
}

export async function signInWithGoogle() {
  return signInWithProvider("google");
}

export async function signInWithMicrosoft() {
  return signInWithProvider("microsoft");
}
