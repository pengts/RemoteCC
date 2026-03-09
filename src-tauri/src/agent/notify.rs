//! Desktop notification helper — in web mode, notifications are a no-op.
//! (No native window to detect visibility; could be replaced with WS event later.)

/// No-op in web mode. Previously sent macOS notifications when window was hidden.
pub fn notify_if_background(_title: &str, _body: &str) {
    // Web mode: no native window/tray. Could push a WS event in the future.
    log::trace!("[notify] web mode, skipping notification: {}", _title);
}
