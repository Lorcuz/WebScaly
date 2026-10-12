# Upgrade to 0.3.0

Reload the unpacked `dist` extension in Chrome and refresh video tabs. Configuration version 1 is migrated once to version 2: enhancement values, profiles, approvals and presets remain; retired settings are discarded; Controls, Compare and HUD become false. Manual version-2 choices remain saved. Version-1 configuration imports receive the same migration.

The old motion-generation feature and its separate build are removed. This version keeps Spatial detail, Anime4K and FSRCNNX and operates at native decoded frame rate. A new abstract scale logo replaces the old letter mark.

Website approval now completes in the worker after Chrome Allow. Removal stops active renderers, including players whose parent website lost approval, and removes overlapping host grants. The compact popup exposes optional tools and the settings gear; detailed errors and measurements are available in settings.
