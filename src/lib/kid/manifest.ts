/** The web app manifest for children's screens. With a card token, the home-screen icon opens that child's card entry. */
export function kidManifest(token: string | null) {
  return {
    name: "꿈의숲키우기",
    short_name: "꿈의숲",
    // The same app whoever is signed in; only where it starts differs.
    id: "/",
    scope: "/",
    start_url: token ? `/join/${encodeURIComponent(token)}/card` : "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "ko",
    icons: [{ src: "/img/app-icon.png", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
