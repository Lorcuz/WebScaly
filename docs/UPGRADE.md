# Upgrade to 0.4.0

Reload the unpacked `dist` extension in Chrome and refresh video tabs. Store installations update automatically. No new permissions are requested.

Existing profiles, approvals and presets carry over. New picture settings start neutral (deband 0, colour 0, skip-above off, adaptive performance on), so the picture changes only through the improved scaler and sharpening. Sharpening, denoise and deband now apply to every engine; lower them on a profile if a neural engine looks too crisp. Quality now chooses the upscaling filter for every engine.

Imports merge into existing profiles by default and never grant access; replacing everything is a separate, confirmed choice. Settings links that use the old section names (Video Enhancement, Site Profiles, Advanced) still open the matching section.

## Upgrade to 0.3.0

Configuration version 1 is migrated once to version 2: enhancement values, profiles, approvals and presets remain; retired settings are discarded; Controls, Compare and HUD become false. The old motion-generation feature and its separate build were removed.
