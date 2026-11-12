# ChronoRisk: Micromort & Microlife Daily Calculator

An educational single-page web app that estimates:

- **Micromorts**: short-term (acute) risk of death today, from an age- and sex-based baseline plus extra activities such as driving, motorcycling, flying, diving or skydiving. 1 micromort = a 1 in 1,000,000 chance of death.
- **Microlives**: the long-term change in life expectancy if today's habits are kept up. 1 microlife = 30 minutes of life expectancy.

Built with HTML5, Tailwind CSS (CDN) and vanilla JavaScript. No backend; inputs are stored only in your browser's localStorage.

## Run

Open `index.html` in a browser, or serve the folder with any static server, for example:

```
npx http-server .
```

## Method

- Baseline: annual death probability q(x) from the SSA 2021 period life table (2024 Trustees Report), ages 18 to 90, linearly interpolated. Daily baseline = q(x) / 365.25 × 1,000,000 micromorts. A fitted Gompertz–Makeham curve is used as a fallback.
- Risks are combined as 1 − ∏(1 − pᵢ).
- Net microlives are summed and then softly capped to keep totals in a realistic range.
- 1-year projection = net microlives × 30 min × 365 / 1440 days.

## Sources

- Spiegelhalter D. & Blastland M., *The Norm Chronicles* (2013)
- Spiegelhalter D., "Using speed of ageing and 'microlives' to communicate the effects of lifetime habits and environment", *BMJ* 2012;345:e8223
- U.S. Social Security Administration, Office of the Chief Actuary, Actuarial Life Table

## Disclaimer

For education only. Values are population averages from published research, not medical advice. Individual risk differs.
