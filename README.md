# أثر — Athar Landing Page

Landing page for the Athar (أثر) Islamic Android application — "اجعل لذكرك أثرًا".

## Tech

- HTML5, CSS3, Vanilla JavaScript — no frameworks, no build tools, no backend.
- Open `index.html` directly in any browser, or host as a static site.

## Structure

```
/
├── index.html          # Landing page (RTL, Arabic-first)
├── css/
│   └── style.css       # Design system, responsive, prefers-reduced-motion
├── js/
│   ├── qrcode.js       # Lightweight client-side QR generator (no deps, v1–7)
│   └── script.js       # Nav, particles, scroll reveal, daily switcher, QR init
├── assets/
│   ├── logo/
│   │   └── logo.png    # Official Athar logo
│   └── apk/
│       └── Athar-v1.0.0.apk   # Real Android app — downloaded on button click
└── README.md
```

## Download

All download buttons point directly to `assets/apk/Athar-v1.0.0.apk` and start the
download only when the user clicks. The APK is served as a static file.

## QR code

The QR section points to the landing page URL.

- By default the current page URL is used automatically when the site is served
  over `http(s)`.
- To pin a specific address, set `CONFIG.DOWNLOAD_PAGE_URL` in `js/script.js` to
  the final deployed URL.
- If no URL is available yet (e.g. opened as a local file), a clearly marked
  placeholder is shown instead.

## Deployment notes

- After deploying, update the `canonical` and `og:url` placeholders in `index.html`.
- No environment variables, keys, or credentials are used.

## Content

All feature names and the offline-capable description reflect the actual Athar app.
No fabricated testimonials, ratings, endorsements, or social links are included.
