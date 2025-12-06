export function signInWithGoogle() {
  try {
    const returnUrl = window.location.href;
    const redirectUrl = new URL("/api/auth/sign-in/google", window.location.origin);

    redirectUrl.searchParams.set("redirect_to", returnUrl);
    redirectUrl.searchParams.set("redirectTo", returnUrl);

    window.location.assign(redirectUrl.toString());
  } catch (error) {
    console.error("Google sign-in failed", error);
    alert("Failed to sign in with Google. Please try again.");
  }
}
