<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into Interface Haze, a browser-based generative synth looper. The project is a vanilla HTML/JS/CSS app with no build system, so PostHog is loaded via the CDN snippet in `index.html`. A `posthog-config.js` file (gitignored) holds the public key and host — copy `posthog-config.example.js` to `posthog-config.js` and fill in the values from your `.env` file to activate tracking.

**Files modified:**
- `index.html` — Added `posthog-config.js` loader and the PostHog CDN snippet with `posthog.init()`
- `script.js` — Added 5 `posthog.capture()` calls across the synth toggle, sequencer, drift, and volume controls

**Files created:**
- `posthog-config.js` *(gitignored)* — Runtime config; fill in from `.env`
- `posthog-config.example.js` — Template showing required variables
- `.env` — Contains `POSTHOG_PUBLIC_KEY` and `POSTHOG_HOST` (gitignored)

| Event | Description | File |
|---|---|---|
| `synth_started` | User turns the synth on by clicking the toggle button | `script.js` |
| `synth_stopped` | User turns the synth off by clicking the toggle button | `script.js` |
| `sequencer_step_toggled` | User toggles an individual step in the sequencer on or off | `script.js` |
| `drift_changed` | User adjusts the drift (vibrato modulation) control | `script.js` |
| `volume_changed` | User adjusts the master volume control | `script.js` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics:** https://eu.posthog.com/project/151171/dashboard/599668
- **Synth Sessions Over Time:** https://eu.posthog.com/project/151171/insights/Zzy3YpsU
- **Synth Start vs. Stop:** https://eu.posthog.com/project/151171/insights/Xwws5C3F
- **Control Usage: Sequencer, Drift & Volume:** https://eu.posthog.com/project/151171/insights/4frnn547
- **Engagement Funnel: Start → Customize:** https://eu.posthog.com/project/151171/insights/CXUgBDXl
- **Daily Active Synth Users:** https://eu.posthog.com/project/151171/insights/ple8quql

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
