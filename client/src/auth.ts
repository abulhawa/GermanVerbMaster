import supabase from "./supabaseClient";

export async function signInWithGoogle() {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("Google sign-in failed", error);
    alert("Failed to sign in with Google. Please try again.");
  }
}
