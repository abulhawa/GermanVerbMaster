export async function signInWithGoogle() {
  try {
    const returnUrl = window.location.href;

    const response = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "google",
        callbackURL: returnUrl,
        errorCallbackURL: returnUrl,
      }),
    });

    if (!response.ok) {
      throw new Error(`Sign-in request failed (${response.status})`);
    }

    const data: { url?: string; redirect?: boolean } = await response.json();

    if (!data.url) {
      throw new Error("Missing Google authorization URL");
    }

    window.location.assign(data.url);
  } catch (error) {
    console.error("Google sign-in failed", error);
    alert("Failed to sign in with Google. Please try again.");
  }
}
