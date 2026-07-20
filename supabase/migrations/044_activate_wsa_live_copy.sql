-- Explicit operator activation for the WSA live copy engine. Applying this
-- migration does not place orders; strategies still require admin publishing
-- and the separate worker process must be running.
UPDATE public.copy_global_settings
SET copy_enabled = TRUE,
    live_copy_enabled = TRUE,
    emergency_stop_enabled = FALSE,
    updated_at = NOW()
WHERE id = TRUE;
